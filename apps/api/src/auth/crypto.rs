//! Authenticated encryption of secrets at rest (AES-256-GCM).
//!
//! Used to protect MFA secrets (TOTP) in the database. The 256-bit data-encryption key is injected
//! via configuration and never written to disk by the application. A fresh random nonce is used
//! per message and stored alongside the ciphertext. Decrypted plaintext is returned in a
//! `Zeroizing` buffer so it is wiped from memory when dropped.

use aes_gcm::aead::{Aead, Generate, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use zeroize::Zeroizing;

use super::error::AuthError;

/// Encrypt `plaintext`, returning `(ciphertext, nonce)`.
pub fn encrypt(key: &[u8; 32], plaintext: &[u8]) -> Result<(Vec<u8>, Vec<u8>), AuthError> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| AuthError::Internal)?;
    let nonce = Nonce::generate();
    let ciphertext = cipher
        .encrypt(&nonce, plaintext)
        .map_err(|_| AuthError::Internal)?;
    Ok((ciphertext, nonce.to_vec()))
}

/// Decrypt a `(ciphertext, nonce)` pair produced by [`encrypt`].
pub fn decrypt(
    key: &[u8; 32],
    ciphertext: &[u8],
    nonce_bytes: &[u8],
) -> Result<Zeroizing<Vec<u8>>, AuthError> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| AuthError::Internal)?;
    let nonce = Nonce::try_from(nonce_bytes).map_err(|_| AuthError::Internal)?;
    let plaintext = cipher
        .decrypt(&nonce, ciphertext)
        .map_err(|_| AuthError::Internal)?;
    Ok(Zeroizing::new(plaintext))
}
