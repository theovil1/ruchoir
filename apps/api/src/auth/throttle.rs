//! Per-account anti-bruteforce: count failed logins and lock an account into a progressive
//! cooldown once they cross a threshold.
//!
//! State lives in Valkey, keyed by the submitted email whether or not an account exists, so the
//! behaviour never reveals account existence. Nothing sensitive (no password) is stored: only
//! counters and a lock marker. This complements the coarse per-IP rate limit applied as a layer
//! on the auth routes.

use fred::interfaces::KeysInterface;
use fred::prelude::Pool;
use fred::types::Expiration;

use super::error::AuthError;
use crate::config::Config;

const FAIL_PREFIX: &str = "login_fail:";
const LOCK_PREFIX: &str = "login_lock:";
const LOCKCOUNT_PREFIX: &str = "login_lockcount:";

/// Whether the account is currently in a cooldown.
pub async fn is_locked(valkey: &Pool, email: &str) -> Result<bool, AuthError> {
    let lock_key = format!("{LOCK_PREFIX}{email}");
    let exists: bool = valkey
        .exists(lock_key.as_str())
        .await
        .map_err(|_| AuthError::Internal)?;
    Ok(exists)
}

/// Record a failed login. Once the failure count reaches the threshold within the window, the
/// account is locked for a progressive (doubling, capped) cooldown and the counter is reset.
pub async fn record_failure(valkey: &Pool, config: &Config, email: &str) -> Result<(), AuthError> {
    let fail_key = format!("{FAIL_PREFIX}{email}");
    let count: i64 = valkey
        .incr(fail_key.as_str())
        .await
        .map_err(|_| AuthError::Internal)?;
    if count == 1 {
        // Start the rolling window on the first failure.
        let _: () = valkey
            .expire(fail_key.as_str(), config.login_failure_window_secs, None)
            .await
            .map_err(|_| AuthError::Internal)?;
    }

    if count >= i64::from(config.login_max_failures) {
        let lockcount_key = format!("{LOCKCOUNT_PREFIX}{email}");
        let cycles: i64 = valkey
            .incr(lockcount_key.as_str())
            .await
            .map_err(|_| AuthError::Internal)?;
        // Keep the lock-cycle memory around long enough to make repeated abuse progressively
        // more expensive, then let it decay.
        let _: () = valkey
            .expire(lockcount_key.as_str(), config.login_lock_max_secs, None)
            .await
            .map_err(|_| AuthError::Internal)?;

        let cooldown = progressive_cooldown(config, cycles);
        let lock_key = format!("{LOCK_PREFIX}{email}");
        let _: () = valkey
            .set(
                lock_key.as_str(),
                "1",
                Some(Expiration::EX(cooldown)),
                None,
                false,
            )
            .await
            .map_err(|_| AuthError::Internal)?;

        // Reset the window counter: the lock now governs access.
        let _: () = valkey
            .del(fail_key.as_str())
            .await
            .map_err(|_| AuthError::Internal)?;
    }
    Ok(())
}

/// Clear all anti-bruteforce state for an account after a successful login.
pub async fn record_success(valkey: &Pool, email: &str) -> Result<(), AuthError> {
    let fail_key = format!("{FAIL_PREFIX}{email}");
    let lock_key = format!("{LOCK_PREFIX}{email}");
    let lockcount_key = format!("{LOCKCOUNT_PREFIX}{email}");
    let _: () = valkey
        .del(fail_key.as_str())
        .await
        .map_err(|_| AuthError::Internal)?;
    let _: () = valkey
        .del(lock_key.as_str())
        .await
        .map_err(|_| AuthError::Internal)?;
    let _: () = valkey
        .del(lockcount_key.as_str())
        .await
        .map_err(|_| AuthError::Internal)?;
    Ok(())
}

/// Cooldown length for the n-th lock cycle: `base * 2^(cycles - 1)`, capped at the configured max.
fn progressive_cooldown(config: &Config, cycles: i64) -> i64 {
    let exponent = (cycles - 1).clamp(0, 16) as u32;
    let factor = 1i64.checked_shl(exponent).unwrap_or(i64::MAX);
    config
        .login_lock_base_secs
        .saturating_mul(factor)
        .min(config.login_lock_max_secs)
}
