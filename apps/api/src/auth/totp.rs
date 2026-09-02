//! TOTP (RFC 6238) construction for authenticator-app two-factor.
//!
//! SHA-1, 6 digits, 30-second step, one step of skew (accepts the adjacent windows). The shared
//! secret is 160 bits from the OS CSPRNG. The `Totp` value here is transient: it is built from the
//! decrypted secret to generate the provisioning URL or verify a code, then dropped.

use totp_rs::{Algorithm, Builder, Totp};

use super::error::AuthError;

/// Length of a TOTP shared secret in bytes (160 bits, per RFC 4226's recommendation).
pub const SECRET_LEN: usize = 20;

/// Generate a fresh TOTP shared secret.
pub fn generate_secret() -> Result<[u8; SECRET_LEN], AuthError> {
    let mut secret = [0u8; SECRET_LEN];
    getrandom::fill(&mut secret).map_err(|_| AuthError::Internal)?;
    Ok(secret)
}

/// Build a `Totp` from a raw secret and the account it belongs to (used in the provisioning URL).
pub fn build(secret: &[u8], account: &str) -> Result<Totp, AuthError> {
    Builder::new()
        .with_algorithm(Algorithm::SHA1)
        .with_digits(6)
        .with_skew(1)
        .with_step_duration(30)
        .with_issuer(Some("Ruchoir"))
        .with_account_name(account)
        .with_secret(secret.to_vec())
        .build()
        .map_err(|_| AuthError::Internal)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generate_and_verify_current_code() {
        let secret = generate_secret().unwrap();
        let totp = build(&secret, "user@example.org").unwrap();
        let code = totp.generate_current();
        assert!(totp.check_current(&code.to_string()).is_some());
    }
}
