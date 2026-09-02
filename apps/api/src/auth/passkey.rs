//! Server-side storage of in-progress WebAuthn registration ceremonies.
//!
//! The `PasskeyRegistration` state produced by `start_passkey_registration` must be kept on the
//! server between the start and finish steps (never handed to the client, which would allow replay).
//! It is stored in Valkey under a short TTL, keyed by user, and consumed atomically on finish.

use fred::interfaces::KeysInterface;
use fred::prelude::Pool;
use fred::types::Expiration;
use uuid::Uuid;
use webauthn_rs::prelude::PasskeyRegistration;

use super::error::AuthError;

const REG_PREFIX: &str = "webauthn_reg:";
/// Ceremonies are short-lived: the user has a few minutes to complete the browser prompt.
const REG_TTL_SECS: i64 = 300;

/// Persist the registration state for a user.
pub async fn store_registration(
    valkey: &Pool,
    user_id: Uuid,
    state: &PasskeyRegistration,
) -> Result<(), AuthError> {
    let json = serde_json::to_string(state).map_err(|_| AuthError::Internal)?;
    let key = format!("{REG_PREFIX}{user_id}");
    let _: () = valkey
        .set(key.as_str(), json, Some(Expiration::EX(REG_TTL_SECS)), None, false)
        .await
        .map_err(|_| AuthError::Internal)?;
    Ok(())
}

/// Consume the registration state for a user (single use).
pub async fn take_registration(
    valkey: &Pool,
    user_id: Uuid,
) -> Result<Option<PasskeyRegistration>, AuthError> {
    let key = format!("{REG_PREFIX}{user_id}");
    let json: Option<String> = valkey
        .getdel(key.as_str())
        .await
        .map_err(|_| AuthError::Internal)?;
    Ok(json.and_then(|j| serde_json::from_str(&j).ok()))
}
