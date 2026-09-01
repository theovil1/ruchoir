//! Authentication endpoints: register, login, logout, log-out-everywhere, the current-session
//! ("me") endpoint, email verification and password reset.
//!
//! The API owns auth end to end. MFA step-up (TOTP, passkeys) lands in a later step; the shapes
//! here are the contract the web client calls.

use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use axum_extra::extract::cookie::CookieJar;
use sea_orm::ActiveValue::{NotSet, Set};
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, IntoActiveModel, QueryFilter};
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use utoipa::ToSchema;
use uuid::Uuid;

use super::cookie::{clear_session_cookie, session_cookie, SESSION_COOKIE};
use super::error::AuthError;
use super::extract::AuthSession;
use super::tokens::{self, TokenPurpose};
use super::{password, session, throttle};
use crate::entities::users;
use crate::state::AppState;

/// New-account request.
#[derive(Debug, Deserialize, ToSchema)]
pub struct RegisterRequest {
    pub email: String,
    pub display_name: String,
    pub password: String,
}

/// Credentials for an existing account.
#[derive(Debug, Deserialize, ToSchema)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

/// A request that carries only an email address (verification resend, reset request).
#[derive(Debug, Deserialize, ToSchema)]
pub struct EmailRequest {
    pub email: String,
}

/// Confirm an email-verification token.
#[derive(Debug, Deserialize, ToSchema)]
pub struct TokenRequest {
    pub token: String,
}

/// Set a new password using a reset token.
#[derive(Debug, Deserialize, ToSchema)]
pub struct PasswordResetConfirm {
    pub token: String,
    pub password: String,
}

/// Public view of an account returned to the client. Never includes secrets.
#[derive(Debug, Serialize, ToSchema)]
pub struct UserSummary {
    pub id: Uuid,
    pub email: String,
    pub display_name: String,
}

impl From<users::Model> for UserSummary {
    fn from(model: users::Model) -> Self {
        Self {
            id: model.id,
            email: model.email,
            display_name: model.display_name,
        }
    }
}

/// Build the auth sub-router. Mounted under `/api/v1/auth` by the main router.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/register", post(register))
        .route("/login", post(login))
        .route("/logout", post(logout))
        .route("/logout/all", post(logout_all))
        .route("/session", get(current_session))
        .route("/verify-email/request", post(verify_email_request))
        .route("/verify-email/confirm", post(verify_email_confirm))
        .route("/password-reset/request", post(password_reset_request))
        .route("/password-reset/confirm", post(password_reset_confirm))
}

/// Register a new account. The account starts unverified; a verification email is sent and no
/// session is opened until the address is confirmed.
#[utoipa::path(
    post,
    path = "/api/v1/auth/register",
    tag = "auth",
    request_body = RegisterRequest,
    responses(
        (status = 201, description = "Account created, verification email sent", body = UserSummary),
        (status = 409, description = "Email already registered"),
        (status = 422, description = "Password does not meet requirements")
    )
)]
pub async fn register(
    State(state): State<AppState>,
    Json(body): Json<RegisterRequest>,
) -> Result<(StatusCode, Json<UserSummary>), AuthError> {
    let email = body.email.trim().to_lowercase();
    let display_name = body.display_name.trim().to_string();
    if email.is_empty() || display_name.is_empty() {
        return Err(AuthError::WeakPassword);
    }
    password::check_policy(&body.password, &state.breaches)?;

    let existing = users::Entity::find()
        .filter(users::Column::Email.eq(email.clone()))
        .one(&state.db)
        .await
        .map_err(|_| AuthError::Internal)?;
    if existing.is_some() {
        return Err(AuthError::EmailTaken);
    }

    let password_hash = password::hash_password(&state.config, &body.password)?;
    let user_id = Uuid::new_v4();
    let model = users::ActiveModel {
        id: Set(user_id),
        email: Set(email.clone()),
        display_name: Set(display_name),
        password_hash: Set(Some(password_hash)),
        status: Set("pending".to_string()),
        mfa_enforced: Set(false),
        created_at: NotSet,
        updated_at: NotSet,
    }
    .insert(&state.db)
    .await
    .map_err(|_| AuthError::Internal)?;

    send_verification_email(&state, user_id, &email).await?;

    Ok((StatusCode::CREATED, Json(model.into())))
}

/// Verify credentials and, on success for a verified account, open a session.
#[utoipa::path(
    post,
    path = "/api/v1/auth/login",
    tag = "auth",
    request_body = LoginRequest,
    responses(
        (status = 200, description = "Authenticated", body = UserSummary),
        (status = 401, description = "Invalid credentials"),
        (status = 403, description = "Account locked or email not verified"),
        (status = 429, description = "Too many attempts")
    )
)]
pub async fn login(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(body): Json<LoginRequest>,
) -> Result<(CookieJar, Json<UserSummary>), AuthError> {
    let email = body.email.trim().to_lowercase();

    // Refuse early if this account is in an anti-bruteforce cooldown. Keyed by the submitted email
    // whether or not it exists, so the response never reveals account existence.
    if throttle::is_locked(&state.valkey, &email).await? {
        return Err(AuthError::TooManyAttempts);
    }

    let user = users::Entity::find()
        .filter(users::Column::Email.eq(email.clone()))
        .one(&state.db)
        .await
        .map_err(|_| AuthError::Internal)?;

    // Admin-locked accounts are refused outright (distinct from a bruteforce cooldown).
    if let Some(ref u) = user {
        if u.status == "locked" {
            return Err(AuthError::AccountLocked);
        }
    }

    // Verify uniformly whether or not the account exists.
    let authenticated = match &user {
        Some(u) => u
            .password_hash
            .as_deref()
            .is_some_and(|phc| password::verify_password(&state.config, &body.password, phc)),
        None => false,
    };

    if !authenticated {
        throttle::record_failure(&state.valkey, &state.config, &email).await?;
        return Err(AuthError::InvalidCredentials);
    }
    throttle::record_success(&state.valkey, &email).await?;

    let user = user.expect("authenticated implies a present user");
    // Only a verified account may open a session (revealed only after a correct password).
    if user.status == "pending" {
        return Err(AuthError::EmailNotVerified);
    }

    let session_id = session::create(&state.valkey, &state.config, user.id).await?;
    let jar = jar.add(session_cookie(session_id, state.config.session_idle_ttl_secs));

    Ok((jar, Json(user.into())))
}

/// Revoke the current session and clear the cookie.
#[utoipa::path(
    post,
    path = "/api/v1/auth/logout",
    tag = "auth",
    responses((status = 204, description = "Session revoked"))
)]
pub async fn logout(
    State(state): State<AppState>,
    jar: CookieJar,
) -> Result<(StatusCode, CookieJar), AuthError> {
    if let Some(cookie) = jar.get(SESSION_COOKIE) {
        session::delete(&state.valkey, cookie.value()).await?;
    }
    Ok((StatusCode::NO_CONTENT, jar.add(clear_session_cookie())))
}

/// Return the currently authenticated identity (the "me" endpoint). The `AuthSession` extractor
/// enforces a valid session; an anonymous request never reaches the body and gets a 401.
#[utoipa::path(
    get,
    path = "/api/v1/auth/session",
    tag = "auth",
    responses(
        (status = 200, description = "Current identity", body = UserSummary),
        (status = 401, description = "Not authenticated")
    )
)]
pub async fn current_session(
    State(state): State<AppState>,
    auth: AuthSession,
) -> Result<Json<UserSummary>, AuthError> {
    let user = users::Entity::find_by_id(auth.user_id)
        .one(&state.db)
        .await
        .map_err(|_| AuthError::Internal)?
        .ok_or(AuthError::Unauthorized)?;
    Ok(Json(user.into()))
}

/// Revoke every session of the current user, then clear the cookie.
#[utoipa::path(
    post,
    path = "/api/v1/auth/logout/all",
    tag = "auth",
    responses((status = 204, description = "All sessions revoked"))
)]
pub async fn logout_all(
    State(state): State<AppState>,
    jar: CookieJar,
) -> Result<(StatusCode, CookieJar), AuthError> {
    if let Some(cookie) = jar.get(SESSION_COOKIE) {
        if let Some(record) = session::get(&state.valkey, cookie.value()).await? {
            session::delete_all(&state.valkey, record.user_id).await?;
        }
    }
    Ok((StatusCode::NO_CONTENT, jar.add(clear_session_cookie())))
}

/// Resend an email-verification link. Always responds `204`, whether or not the address exists or
/// is still pending, so it never reveals account state.
#[utoipa::path(
    post,
    path = "/api/v1/auth/verify-email/request",
    tag = "auth",
    request_body = EmailRequest,
    responses((status = 204, description = "Verification email sent if applicable"))
)]
pub async fn verify_email_request(
    State(state): State<AppState>,
    Json(body): Json<EmailRequest>,
) -> Result<StatusCode, AuthError> {
    let email = body.email.trim().to_lowercase();
    if let Some(user) = users::Entity::find()
        .filter(users::Column::Email.eq(email.clone()))
        .one(&state.db)
        .await
        .map_err(|_| AuthError::Internal)?
    {
        if user.status == "pending" {
            send_verification_email(&state, user.id, &email).await?;
        }
    }
    Ok(StatusCode::NO_CONTENT)
}

/// Confirm an email address with a verification token, activating the account.
#[utoipa::path(
    post,
    path = "/api/v1/auth/verify-email/confirm",
    tag = "auth",
    request_body = TokenRequest,
    responses(
        (status = 204, description = "Email verified"),
        (status = 400, description = "Invalid or expired token")
    )
)]
pub async fn verify_email_confirm(
    State(state): State<AppState>,
    Json(body): Json<TokenRequest>,
) -> Result<StatusCode, AuthError> {
    let user_id = tokens::consume(&state.valkey, TokenPurpose::VerifyEmail, &body.token)
        .await?
        .ok_or(AuthError::InvalidToken)?;
    let user = users::Entity::find_by_id(user_id)
        .one(&state.db)
        .await
        .map_err(|_| AuthError::Internal)?
        .ok_or(AuthError::InvalidToken)?;

    let mut active = user.into_active_model();
    active.status = Set("active".to_string());
    active.updated_at = Set(OffsetDateTime::now_utc());
    active
        .update(&state.db)
        .await
        .map_err(|_| AuthError::Internal)?;
    Ok(StatusCode::NO_CONTENT)
}

/// Request a password reset. Always responds `204`, whether or not the address exists, so it never
/// reveals account existence.
#[utoipa::path(
    post,
    path = "/api/v1/auth/password-reset/request",
    tag = "auth",
    request_body = EmailRequest,
    responses((status = 204, description = "Reset email sent if applicable"))
)]
pub async fn password_reset_request(
    State(state): State<AppState>,
    Json(body): Json<EmailRequest>,
) -> Result<StatusCode, AuthError> {
    let email = body.email.trim().to_lowercase();
    if let Some(user) = users::Entity::find()
        .filter(users::Column::Email.eq(email.clone()))
        .one(&state.db)
        .await
        .map_err(|_| AuthError::Internal)?
    {
        // Only password accounts can reset a password.
        if user.password_hash.is_some() {
            send_reset_email(&state, user.id, &email).await?;
        }
    }
    Ok(StatusCode::NO_CONTENT)
}

/// Set a new password from a reset token and revoke all existing sessions of that user.
#[utoipa::path(
    post,
    path = "/api/v1/auth/password-reset/confirm",
    tag = "auth",
    request_body = PasswordResetConfirm,
    responses(
        (status = 204, description = "Password changed"),
        (status = 400, description = "Invalid or expired token"),
        (status = 422, description = "Password does not meet requirements")
    )
)]
pub async fn password_reset_confirm(
    State(state): State<AppState>,
    Json(body): Json<PasswordResetConfirm>,
) -> Result<StatusCode, AuthError> {
    // Validate the new password before spending the token.
    password::check_policy(&body.password, &state.breaches)?;

    let user_id = tokens::consume(&state.valkey, TokenPurpose::PasswordReset, &body.token)
        .await?
        .ok_or(AuthError::InvalidToken)?;
    let user = users::Entity::find_by_id(user_id)
        .one(&state.db)
        .await
        .map_err(|_| AuthError::Internal)?
        .ok_or(AuthError::InvalidToken)?;

    let new_hash = password::hash_password(&state.config, &body.password)?;
    let mut active = user.into_active_model();
    active.password_hash = Set(Some(new_hash));
    active.updated_at = Set(OffsetDateTime::now_utc());
    active
        .update(&state.db)
        .await
        .map_err(|_| AuthError::Internal)?;

    // A password change invalidates every existing session.
    session::delete_all(&state.valkey, user_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Issue and send an email-verification link for a user.
async fn send_verification_email(
    state: &AppState,
    user_id: Uuid,
    email: &str,
) -> Result<(), AuthError> {
    let token = tokens::issue(
        &state.valkey,
        TokenPurpose::VerifyEmail,
        user_id,
        state.config.email_verification_ttl_secs,
    )
    .await?;
    let base = state.mailer.base_url.trim_end_matches('/');
    let link = format!("{base}/verify-email?token={token}");
    let hours = state.config.email_verification_ttl_secs / 3600;
    let body = format!(
        "Welcome to Ruchoir.\n\nConfirm your email address by opening this link:\n{link}\n\n\
         The link expires in {hours} hours. If you did not create an account, ignore this message."
    );
    state
        .mailer
        .send(email, "Confirm your Ruchoir email", body)
        .await
        .map_err(|_| AuthError::Internal)
}

/// Issue and send a password-reset link for a user.
async fn send_reset_email(state: &AppState, user_id: Uuid, email: &str) -> Result<(), AuthError> {
    let token = tokens::issue(
        &state.valkey,
        TokenPurpose::PasswordReset,
        user_id,
        state.config.password_reset_ttl_secs,
    )
    .await?;
    let base = state.mailer.base_url.trim_end_matches('/');
    let link = format!("{base}/reset-password?token={token}");
    let minutes = state.config.password_reset_ttl_secs / 60;
    let body = format!(
        "A password reset was requested for your Ruchoir account.\n\nSet a new password here:\n{link}\n\n\
         The link expires in {minutes} minutes. If you did not request this, ignore this message."
    );
    state
        .mailer
        .send(email, "Reset your Ruchoir password", body)
        .await
        .map_err(|_| AuthError::Internal)
}
