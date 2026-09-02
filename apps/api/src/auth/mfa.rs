//! Transient state for the login MFA step-up.
//!
//! When an MFA-enforced account passes the password check, no session is opened yet. Instead a
//! short-lived pending token is stored in Valkey (mapping to the user id) and returned to the
//! client, which then completes a second factor (TOTP, passkey or recovery code) against it. On
//! success the token is consumed and a full session is issued.

use fred::interfaces::KeysInterface;
use fred::prelude::Pool;
use fred::types::Expiration;
use uuid::Uuid;

use super::error::AuthError;

const PENDING_PREFIX: &str = "mfa_pending:";
/// The user has a few minutes to complete the second factor.
const PENDING_TTL_SECS: i64 = 300;

/// Open a pending MFA step-up for a user and return its opaque token.
pub async fn start_pending(valkey: &Pool, user_id: Uuid) -> Result<String, AuthError> {
    let token = generate_token()?;
    let key = format!("{PENDING_PREFIX}{token}");
    let _: () = valkey
        .set(
            key.as_str(),
            user_id.to_string(),
            Some(Expiration::EX(PENDING_TTL_SECS)),
            None,
            false,
        )
        .await
        .map_err(|_| AuthError::Internal)?;
    Ok(token)
}

/// Resolve a pending token to its user id without consuming it (allows a retry on a wrong code).
pub async fn resolve_pending(valkey: &Pool, token: &str) -> Result<Option<Uuid>, AuthError> {
    let key = format!("{PENDING_PREFIX}{token}");
    let value: Option<String> = valkey
        .get(key.as_str())
        .await
        .map_err(|_| AuthError::Internal)?;
    Ok(value.and_then(|v| Uuid::parse_str(&v).ok()))
}

/// Consume a pending token after a successful second factor.
pub async fn consume_pending(valkey: &Pool, token: &str) -> Result<(), AuthError> {
    let key = format!("{PENDING_PREFIX}{token}");
    let _: () = valkey
        .del(key.as_str())
        .await
        .map_err(|_| AuthError::Internal)?;
    Ok(())
}

fn generate_token() -> Result<String, AuthError> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|_| AuthError::Internal)?;
    use std::fmt::Write as _;
    let mut hex = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        let _ = write!(hex, "{byte:02x}");
    }
    Ok(hex)
}
