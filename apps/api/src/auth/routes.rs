//! Authentication endpoints: register, login, logout and log-out-everywhere.
//!
//! Password auth only for now. MFA step-up (TOTP, passkeys) and the email-verification gate land
//! in later steps; the shapes here are the contract the web client will call.

use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use axum_extra::extract::cookie::CookieJar;
use sea_orm::ActiveValue::{NotSet, Set};
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use super::cookie::{clear_session_cookie, session_cookie, SESSION_COOKIE};
use super::error::AuthError;
use super::extract::AuthSession;
use super::{password, session};
use crate::entities::users;
use crate::state::AppState;

/// Minimum password length. The offline breached-password check lands with the email flows.
const MIN_PASSWORD_LEN: usize = 12;

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
}

/// Register a new account, open a session and set the session cookie.
#[utoipa::path(
    post,
    path = "/api/v1/auth/register",
    tag = "auth",
    request_body = RegisterRequest,
    responses(
        (status = 201, description = "Account created", body = UserSummary),
        (status = 409, description = "Email already registered"),
        (status = 422, description = "Password does not meet requirements")
    )
)]
pub async fn register(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(body): Json<RegisterRequest>,
) -> Result<(StatusCode, CookieJar, Json<UserSummary>), AuthError> {
    let email = body.email.trim().to_lowercase();
    let display_name = body.display_name.trim().to_string();
    if email.is_empty() || display_name.is_empty() {
        return Err(AuthError::WeakPassword);
    }
    if body.password.chars().count() < MIN_PASSWORD_LEN {
        return Err(AuthError::WeakPassword);
    }

    // Pre-check for a friendly conflict. The unique index is the real guard against races.
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

    // Accounts start active for now. The email-verification gate (pending -> active) lands with
    // the email flows.
    let model = users::ActiveModel {
        id: Set(user_id),
        email: Set(email),
        display_name: Set(display_name),
        password_hash: Set(Some(password_hash)),
        status: Set("active".to_string()),
        mfa_enforced: Set(false),
        created_at: NotSet,
        updated_at: NotSet,
    }
    .insert(&state.db)
    .await
    .map_err(|_| AuthError::Internal)?;

    let session_id = session::create(&state.valkey, &state.config, user_id).await?;
    let jar = jar.add(session_cookie(
        session_id,
        state.config.session_idle_ttl_secs,
    ));

    Ok((StatusCode::CREATED, jar, Json(model.into())))
}

/// Verify credentials and, on success, open a session.
#[utoipa::path(
    post,
    path = "/api/v1/auth/login",
    tag = "auth",
    request_body = LoginRequest,
    responses(
        (status = 200, description = "Authenticated", body = UserSummary),
        (status = 401, description = "Invalid credentials"),
        (status = 403, description = "Account locked")
    )
)]
pub async fn login(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(body): Json<LoginRequest>,
) -> Result<(CookieJar, Json<UserSummary>), AuthError> {
    let email = body.email.trim().to_lowercase();
    let user = users::Entity::find()
        .filter(users::Column::Email.eq(email))
        .one(&state.db)
        .await
        .map_err(|_| AuthError::Internal)?;

    // Uniform failure whether or not the account exists. (Anti-bruteforce and timing hardening
    // land in a later step.)
    let Some(user) = user else {
        return Err(AuthError::InvalidCredentials);
    };
    if user.status == "locked" {
        return Err(AuthError::AccountLocked);
    }
    let Some(ref phc) = user.password_hash else {
        return Err(AuthError::InvalidCredentials);
    };
    if !password::verify_password(&state.config, &body.password, phc) {
        return Err(AuthError::InvalidCredentials);
    }

    // A full session is issued directly; the MFA step-up branch arrives with MFA.
    let session_id = session::create(&state.valkey, &state.config, user.id).await?;
    let jar = jar.add(session_cookie(
        session_id,
        state.config.session_idle_ttl_secs,
    ));

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
