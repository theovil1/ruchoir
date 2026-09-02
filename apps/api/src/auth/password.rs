//! Password hashing with argon2id.
//!
//! Cost parameters come from configuration (OWASP-aligned baseline). The salt is drawn from the
//! OS CSPRNG by the hasher itself. Passwords are never logged and only ever leave this module as
//! an opaque PHC string.

use argon2::password_hash::phc::PasswordHash;
use argon2::password_hash::{PasswordHasher, PasswordVerifier};
use argon2::{Algorithm, Argon2, Params, Version};

use super::breach::BreachFilter;
use super::error::AuthError;
use crate::config::Config;

/// Minimum password length.
pub const MIN_PASSWORD_LEN: usize = 12;

/// Validate a password against policy: a minimum length and an offline breached-password check.
pub fn check_policy(password: &str, breaches: &BreachFilter) -> Result<(), AuthError> {
    if password.chars().count() < MIN_PASSWORD_LEN {
        return Err(AuthError::WeakPassword);
    }
    if breaches.is_breached(password) {
        return Err(AuthError::BreachedPassword);
    }
    Ok(())
}

/// Hash a plaintext password into a PHC string suitable for storage. A random salt is generated
/// internally by the hasher.
pub fn hash_password(config: &Config, password: &str) -> Result<String, AuthError> {
    let hasher = build_hasher(config)?;
    let hash = hasher
        .hash_password(password.as_bytes())
        .map_err(|_| AuthError::Internal)?;
    Ok(hash.to_string())
}

/// Verify a plaintext password against a stored PHC string. Returns `false` on any parse or
/// mismatch, never distinguishing the reason (avoids leaking hash structure).
pub fn verify_password(config: &Config, password: &str, phc: &str) -> bool {
    let Ok(parsed) = PasswordHash::new(phc) else {
        return false;
    };
    let Ok(hasher) = build_hasher(config) else {
        return false;
    };
    hasher.verify_password(password.as_bytes(), &parsed).is_ok()
}

/// Construct an argon2id hasher from the configured cost parameters.
fn build_hasher(config: &Config) -> Result<Argon2<'static>, AuthError> {
    let params = Params::new(
        config.argon2_memory_kib,
        config.argon2_iterations,
        config.argon2_parallelism,
        None,
    )
    .map_err(|_| AuthError::Internal)?;
    Ok(Argon2::new(Algorithm::Argon2id, Version::V0x13, params))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::breach::BreachFilter;

    #[test]
    fn policy_enforces_minimum_length() {
        let breaches = BreachFilter::disabled();
        assert!(check_policy("short", &breaches).is_err());
        assert!(check_policy("this is long enough", &breaches).is_ok());
    }
}
