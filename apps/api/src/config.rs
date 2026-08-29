//! Runtime configuration, read from environment variables.
//!
//! Every value has a sensible local-development default so `cargo run` works out of
//! the box. In containers and production, values are injected through the environment
//! (see `.env.example` and `docker-compose.yml`). No secret is ever hard-coded.

use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;

/// Fully resolved server configuration.
#[derive(Debug, Clone)]
pub struct Config {
    /// Socket the HTTP/TLS server binds to.
    pub addr: SocketAddr,
    /// Directory holding the static web bundle (Next.js export output) to serve.
    pub web_dist: PathBuf,
    /// Optional directory holding the self-hosted emoji pack (Fluent assets), served under
    /// `/emoji`. When unset or absent, the client falls back to native OS emoji. The pack is a
    /// deployment choice kept out of the web bundle because it can be large.
    pub emoji_dir: Option<PathBuf>,
    /// Optional TLS material. When both are set (and the `tls` feature is built in),
    /// the server serves HTTPS; otherwise it serves plain HTTP (local dev only).
    pub tls_cert: Option<PathBuf>,
    pub tls_key: Option<PathBuf>,
}

impl Config {
    /// Build the configuration from the process environment, applying defaults.
    pub fn from_env() -> Result<Self, ConfigError> {
        let host: IpAddr = env_or("WORKCHAT_API_HOST", "0.0.0.0")
            .parse()
            .map_err(|_| ConfigError::Invalid("WORKCHAT_API_HOST"))?;
        let port: u16 = env_or("WORKCHAT_API_PORT", "8080")
            .parse()
            .map_err(|_| ConfigError::Invalid("WORKCHAT_API_PORT"))?;

        let web_dist = PathBuf::from(env_or("WORKCHAT_WEB_DIST", "./apps/web/out"));
        let emoji_dir = env_opt("WORKCHAT_EMOJI_DIR").map(PathBuf::from);

        let tls_cert = env_opt("WORKCHAT_TLS_CERT").map(PathBuf::from);
        let tls_key = env_opt("WORKCHAT_TLS_KEY").map(PathBuf::from);

        Ok(Self {
            addr: SocketAddr::new(host, port),
            web_dist,
            emoji_dir,
            tls_cert,
            tls_key,
        })
    }

    /// Whether TLS material is configured. Actual TLS serving also requires the
    /// `tls` build feature.
    pub fn tls_enabled(&self) -> bool {
        self.tls_cert.is_some() && self.tls_key.is_some()
    }
}

/// Read an environment variable or fall back to a default.
fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

/// Read an environment variable, treating empty strings as unset.
fn env_opt(key: &str) -> Option<String> {
    match std::env::var(key) {
        Ok(v) if !v.trim().is_empty() => Some(v),
        _ => None,
    }
}

/// Configuration errors surfaced at startup.
#[derive(Debug)]
pub enum ConfigError {
    /// A variable was present but could not be parsed.
    Invalid(&'static str),
}

impl std::fmt::Display for ConfigError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ConfigError::Invalid(key) => write!(f, "invalid value for {key}"),
        }
    }
}

impl std::error::Error for ConfigError {}
