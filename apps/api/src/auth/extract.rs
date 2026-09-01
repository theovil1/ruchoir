//! The authorization guard.
//!
//! `AuthSession` is an Axum extractor that resolves the caller's identity server-side from the
//! session cookie on every protected request. Missing or invalid session -> `401`, with no side
//! effect. This is the single choke point the client cannot bypass: handlers that take an
//! `AuthSession` argument are authenticated by construction. Ownership and role checks build on
//! `user_id` in later lots.

use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum_extra::extract::cookie::CookieJar;
use uuid::Uuid;

use super::cookie::SESSION_COOKIE;
use super::error::AuthError;
use super::session;
use crate::state::AppState;

/// The authenticated caller, resolved from the session cookie.
pub struct AuthSession {
    /// The owning user.
    pub user_id: Uuid,
    /// The opaque session id. Reserved for session rotation on MFA step-up.
    #[allow(dead_code)]
    pub session_id: String,
    /// The session's MFA assurance level. Reserved for MFA gating.
    #[allow(dead_code)]
    pub mfa_level: String,
}

impl FromRequestParts<AppState> for AuthSession {
    type Rejection = AuthError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let jar = CookieJar::from_headers(&parts.headers);
        let cookie = jar.get(SESSION_COOKIE).ok_or(AuthError::Unauthorized)?;
        let session_id = cookie.value().to_string();

        let record = session::resolve(&state.valkey, &state.config, &session_id)
            .await?
            .ok_or(AuthError::Unauthorized)?;

        Ok(Self {
            user_id: record.user_id,
            session_id,
            mfa_level: record.mfa_level,
        })
    }
}
