//! Offline breached-password check backed by a bloom filter.
//!
//! A deployment builds a bloom filter from a public breach corpus (SHA-1 keyed, e.g. the
//! downloadable Pwned-Passwords hash list) at deploy time and points `RUCHOIR_BREACHED_PW_BLOOM`
//! at the resulting file. At runtime the API loads it and rejects any candidate password whose
//! SHA-1 digest is present. The check is entirely local: no network request is ever made, so no
//! candidate password leaves the process. When no file is configured the check is disabled.
//!
//! Building and refreshing the corpus is deployment tooling (see the operations docs); this module
//! is the read side plus enough of the write side (`new`/`insert_password`) to be unit-tested.
//!
//! On-disk format (little-endian): magic `b"RCHBLM01"`, `u64` bit count, `u32` hash count, then
//! `ceil(bits / 8)` bytes of bit array.

use std::path::Path;

use sha1::{Digest, Sha1};

const MAGIC: &[u8; 8] = b"RCHBLM01";

/// A bloom filter of breached password SHA-1 digests.
pub struct BreachFilter {
    enabled: bool,
    num_bits: u64,
    num_hashes: u32,
    bits: Vec<u8>,
}

impl BreachFilter {
    /// A disabled filter: every password is treated as not breached (the check is skipped).
    pub fn disabled() -> Self {
        Self {
            enabled: false,
            num_bits: 0,
            num_hashes: 0,
            bits: Vec::new(),
        }
    }

    /// Load a filter from a file produced by the deploy-time builder.
    pub fn from_path(path: &Path) -> Result<Self, String> {
        let raw = std::fs::read(path).map_err(|e| format!("reading breach filter: {e}"))?;
        if raw.len() < 20 || &raw[0..8] != MAGIC {
            return Err("not a Ruchoir breach filter file".to_string());
        }
        let num_bits = u64::from_le_bytes(raw[8..16].try_into().unwrap());
        let num_hashes = u32::from_le_bytes(raw[16..20].try_into().unwrap());
        let expected = num_bits.div_ceil(8) as usize;
        let bits = raw[20..].to_vec();
        if num_bits == 0 || num_hashes == 0 || bits.len() != expected {
            return Err("breach filter header does not match its data".to_string());
        }
        Ok(Self {
            enabled: true,
            num_bits,
            num_hashes,
            bits,
        })
    }

    /// Whether the password appears in the breach corpus. Always `false` when disabled.
    pub fn is_breached(&self, password: &str) -> bool {
        if !self.enabled {
            return false;
        }
        let digest = sha1(password);
        self.indices(&digest).all(|idx| self.get_bit(idx))
    }

    /// Create an empty filter sized for `capacity` entries at the target false-positive `rate`.
    /// Write side: used by the tests here and by the deploy-time filter builder, not by the running
    /// server (which only reads a prebuilt filter).
    #[allow(dead_code)]
    pub fn new(capacity: u64, rate: f64) -> Self {
        let n = capacity.max(1) as f64;
        let ln2 = std::f64::consts::LN_2;
        let m = (-(n * rate.ln()) / (ln2 * ln2)).ceil().max(8.0) as u64;
        let num_bits = m.div_ceil(8) * 8; // whole bytes
        let num_hashes = (((num_bits as f64 / n) * ln2).round() as u32).clamp(1, 32);
        Self {
            enabled: true,
            num_bits,
            num_hashes,
            bits: vec![0u8; (num_bits / 8) as usize],
        }
    }

    /// Insert a password's SHA-1 digest into the filter. Write side (builder / tests).
    #[allow(dead_code)]
    pub fn insert_password(&mut self, password: &str) {
        let digest = sha1(password);
        let indices: Vec<u64> = self.indices(&digest).collect();
        for idx in indices {
            self.set_bit(idx);
        }
    }

    /// Serialize the filter in the on-disk format. Write side (builder / tests).
    #[allow(dead_code)]
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut out = Vec::with_capacity(20 + self.bits.len());
        out.extend_from_slice(MAGIC);
        out.extend_from_slice(&self.num_bits.to_le_bytes());
        out.extend_from_slice(&self.num_hashes.to_le_bytes());
        out.extend_from_slice(&self.bits);
        out
    }

    /// The bit indices for a digest, via double hashing (Kirsch-Mitzenmacher).
    fn indices(&self, digest: &[u8; 20]) -> impl Iterator<Item = u64> + '_ {
        let h1 = u64::from_le_bytes(digest[0..8].try_into().unwrap());
        // Force odd so successive probes stride across the whole bit space.
        let h2 = u64::from_le_bytes(digest[8..16].try_into().unwrap()) | 1;
        let num_bits = self.num_bits;
        (0..self.num_hashes as u64).map(move |i| h1.wrapping_add(i.wrapping_mul(h2)) % num_bits)
    }

    fn get_bit(&self, idx: u64) -> bool {
        self.bits[(idx / 8) as usize] & (1 << (idx % 8)) != 0
    }

    #[allow(dead_code)]
    fn set_bit(&mut self, idx: u64) {
        self.bits[(idx / 8) as usize] |= 1 << (idx % 8);
    }
}

/// SHA-1 digest of a password as 20 bytes.
fn sha1(password: &str) -> [u8; 20] {
    let mut hasher = Sha1::new();
    hasher.update(password.as_bytes());
    let output = hasher.finalize();
    let mut digest = [0u8; 20];
    digest.copy_from_slice(&output);
    digest
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disabled_never_flags() {
        let filter = BreachFilter::disabled();
        assert!(!filter.is_breached("password"));
    }

    #[test]
    fn detects_inserted_and_roundtrips() {
        let mut filter = BreachFilter::new(1000, 0.001);
        filter.insert_password("password");
        filter.insert_password("hunter2");
        assert!(filter.is_breached("password"));
        assert!(filter.is_breached("hunter2"));
        // A fresh, high-entropy string is very unlikely to collide.
        assert!(!filter.is_breached("Zr9-quokka-verandah-8134-sovereign"));

        // Serialized then reloaded, the filter behaves identically.
        let bytes = filter.to_bytes();
        let path = std::env::temp_dir().join("ruchoir-breach-test.blm");
        std::fs::write(&path, &bytes).unwrap();
        let reloaded = BreachFilter::from_path(&path).unwrap();
        assert!(reloaded.is_breached("password"));
        assert!(!reloaded.is_breached("Zr9-quokka-verandah-8134-sovereign"));
        let _ = std::fs::remove_file(&path);
    }
}
