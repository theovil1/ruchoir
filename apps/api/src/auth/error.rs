//! Authentication error type and its HTTP representation.
//!
//! Responses are deliberately terse and uniform so they never reveal whether an email is
//! registered beyond a generic conflict. Nothing sensitive is ever placed in the body.

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;

/// Errors surfaced by the auth endpoints.
#[derive(Debug)]
pub enum AuthError {
    /// Registration hit an existing account (generic conflict, no enumeration).
    EmailTaken,
    /// Wrong email or password (uniform, does not distinguish the two).
    InvalidCredentials,
    /// No valid session on a protected request.
    Unauthorized,
    /// Password failed the policy (length for now; breach check lands later).
    WeakPassword,
    /// The account is locked.
    AccountLocked,
    /// Too many failed attempts: the account is in an anti-bruteforce cooldown.
    TooManyAttempts,
    /// Any unexpected server-side failure. Never leaks internals to the client.
    Internal,
}

#[derive(Serialize)]
struct ErrorBody {
    error: &'static str,
    message: &'static str,
}

impl IntoResponse for AuthError {
    fn into_response(self) -> Response {
        let (status, error, message) = match self {
            AuthError::EmailTaken => (
                StatusCode::CONFLICT,
                "email_taken",
                "An account with this email already exists.",
            ),
            AuthError::InvalidCredentials => (
                StatusCode::UNAUTHORIZED,
                "invalid_credentials",
                "Invalid email or password.",
            ),
            AuthError::Unauthorized => (
                StatusCode::UNAUTHORIZED,
                "unauthorized",
                "Authentication required.",
            ),
            AuthError::WeakPassword => (
                StatusCode::UNPROCESSABLE_ENTITY,
                "weak_password",
                "Password does not meet the minimum requirements.",
            ),
            AuthError::AccountLocked => (
                StatusCode::FORBIDDEN,
                "account_locked",
                "This account is locked.",
            ),
            AuthError::TooManyAttempts => (
                StatusCode::TOO_MANY_REQUESTS,
                "too_many_attempts",
                "Too many attempts. Try again later.",
            ),
            AuthError::Internal => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_error",
                "An unexpected error occurred.",
            ),
        };
        (status, Json(ErrorBody { error, message })).into_response()
    }
}
