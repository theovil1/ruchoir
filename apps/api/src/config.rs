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
    /// PostgreSQL connection URL (source of truth). Dev connects in plaintext over the trusted
    /// Docker network; TLS-to-database is a later hardening concern.
    pub database_url: String,
    /// Maximum size of the PostgreSQL connection pool.
    pub db_max_connections: u32,
    /// Valkey (RESP) connection URL, used for opaque sessions and, later, pub-sub / presence.
    pub valkey_url: String,
    /// Size of the Valkey connection pool.
    pub valkey_pool_size: usize,
    /// Whether the API applies pending migrations automatically on startup. True in dev; set
    /// `RUCHOIR_AUTO_MIGRATE=false` in production and apply them through the `migrate` subcommand.
    pub auto_migrate: bool,
    /// argon2id memory cost in KiB.
    pub argon2_memory_kib: u32,
    /// argon2id iterations (time cost).
    pub argon2_iterations: u32,
    /// argon2id degree of parallelism.
    pub argon2_parallelism: u32,
    /// Sliding session idle timeout, in seconds: a session expires if unused for this long.
    pub session_idle_ttl_secs: i64,
    /// Absolute session lifetime cap, in seconds, regardless of activity.
    pub session_absolute_ttl_secs: i64,
    /// Failed logins for one account within the window before it enters a cooldown.
    pub login_max_failures: u32,
    /// Rolling window, in seconds, over which failed logins are counted.
    pub login_failure_window_secs: i64,
    /// Base cooldown, in seconds, applied on the first lockout. Doubles on repeat lockouts.
    pub login_lock_base_secs: i64,
    /// Maximum cooldown, in seconds, the progressive backoff can reach.
    pub login_lock_max_secs: i64,
    /// Per-IP rate limit on the auth routes: burst capacity (requests allowed to arrive at once).
    pub auth_rate_burst: u32,
    /// Per-IP rate limit on the auth routes: interval, in ms, after which one request is replenished.
    pub auth_rate_period_ms: u64,
    /// SMTP relay host for outgoing email. When unset, email is logged for local dev instead of sent.
    pub smtp_host: Option<String>,
    /// SMTP relay port (STARTTLS submission is 587 by default).
    pub smtp_port: u16,
    /// Optional SMTP username / password for authenticated relays.
    pub smtp_username: Option<String>,
    pub smtp_password: Option<String>,
    /// `From` mailbox for outgoing email, e.g. `Ruchoir <no-reply@example.org>`.
    pub smtp_from: String,
    /// Public base URL used to build verification / reset links in emails.
    pub public_base_url: String,
    /// Lifetime, in seconds, of an email-verification token.
    pub email_verification_ttl_secs: i64,
    /// Lifetime, in seconds, of a password-reset token.
    pub password_reset_ttl_secs: i64,
    /// Path to the breached-password bloom filter. When unset, the breach check is disabled.
    pub breached_pw_bloom_path: Option<PathBuf>,
    /// WebAuthn relying-party id (registrable domain, e.g. `localhost` or `ruchoir.example.org`).
    pub webauthn_rp_id: String,
    /// WebAuthn relying-party origin (full URL the browser sees, e.g. `https://ruchoir.example.org`).
    pub webauthn_origin: String,
    /// Whether the Google OIDC connector is enabled (off by default; the flow is not implemented yet).
    pub oidc_google_enabled: bool,
    /// Whether the Microsoft OIDC connector is enabled (off by default; not implemented yet).
    pub oidc_microsoft_enabled: bool,
}

impl Config {
    /// Build the configuration from the process environment, applying defaults.
    pub fn from_env() -> Result<Self, ConfigError> {
        let host: IpAddr = env_or("RUCHOIR_API_HOST", "0.0.0.0")
            .parse()
            .map_err(|_| ConfigError::Invalid("RUCHOIR_API_HOST"))?;
        let port: u16 = env_or("RUCHOIR_API_PORT", "8080")
            .parse()
            .map_err(|_| ConfigError::Invalid("RUCHOIR_API_PORT"))?;

        let web_dist = PathBuf::from(env_or("RUCHOIR_WEB_DIST", "./apps/web/out"));
        let emoji_dir = env_opt("RUCHOIR_EMOJI_DIR").map(PathBuf::from);

        let tls_cert = env_opt("RUCHOIR_TLS_CERT").map(PathBuf::from);
        let tls_key = env_opt("RUCHOIR_TLS_KEY").map(PathBuf::from);

        let database_url = env_or(
            "DATABASE_URL",
            "postgres://ruchoir:ruchoir@localhost:5432/ruchoir",
        );
        let db_max_connections: u32 = env_or("RUCHOIR_DB_MAX_CONNECTIONS", "10")
            .parse()
            .map_err(|_| ConfigError::Invalid("RUCHOIR_DB_MAX_CONNECTIONS"))?;
        let valkey_url = env_or("VALKEY_URL", "redis://localhost:6379");
        let valkey_pool_size: usize = env_or("RUCHOIR_VALKEY_POOL_SIZE", "6")
            .parse()
            .map_err(|_| ConfigError::Invalid("RUCHOIR_VALKEY_POOL_SIZE"))?;
        let auto_migrate: bool = env_or("RUCHOIR_AUTO_MIGRATE", "true")
            .parse()
            .map_err(|_| ConfigError::Invalid("RUCHOIR_AUTO_MIGRATE"))?;

        // argon2id cost parameters, OWASP-aligned baseline (19 MiB, t=2, p=1). Tunable so the
        // cost can be raised on stronger hardware without a code change.
        let argon2_memory_kib: u32 = env_or("RUCHOIR_ARGON2_MEMORY_KIB", "19456")
            .parse()
            .map_err(|_| ConfigError::Invalid("RUCHOIR_ARGON2_MEMORY_KIB"))?;
        let argon2_iterations: u32 = env_or("RUCHOIR_ARGON2_ITERATIONS", "2")
            .parse()
            .map_err(|_| ConfigError::Invalid("RUCHOIR_ARGON2_ITERATIONS"))?;
        let argon2_parallelism: u32 = env_or("RUCHOIR_ARGON2_PARALLELISM", "1")
            .parse()
            .map_err(|_| ConfigError::Invalid("RUCHOIR_ARGON2_PARALLELISM"))?;

        // Session lifetimes: sliding idle timeout (14 days) plus an absolute cap (30 days).
        let session_idle_ttl_secs: i64 = env_or("RUCHOIR_SESSION_IDLE_TTL_SECS", "1209600")
            .parse()
            .map_err(|_| ConfigError::Invalid("RUCHOIR_SESSION_IDLE_TTL_SECS"))?;
        let session_absolute_ttl_secs: i64 = env_or("RUCHOIR_SESSION_ABSOLUTE_TTL_SECS", "2592000")
            .parse()
            .map_err(|_| ConfigError::Invalid("RUCHOIR_SESSION_ABSOLUTE_TTL_SECS"))?;

        // Anti-bruteforce: lock an account after too many failed logins in a rolling window, with
        // a progressive (doubling) cooldown capped at a maximum.
        let login_max_failures: u32 = env_or("RUCHOIR_LOGIN_MAX_FAILURES", "5")
            .parse()
            .map_err(|_| ConfigError::Invalid("RUCHOIR_LOGIN_MAX_FAILURES"))?;
        let login_failure_window_secs: i64 = env_or("RUCHOIR_LOGIN_FAILURE_WINDOW_SECS", "900")
            .parse()
            .map_err(|_| ConfigError::Invalid("RUCHOIR_LOGIN_FAILURE_WINDOW_SECS"))?;
        let login_lock_base_secs: i64 = env_or("RUCHOIR_LOGIN_LOCK_BASE_SECS", "900")
            .parse()
            .map_err(|_| ConfigError::Invalid("RUCHOIR_LOGIN_LOCK_BASE_SECS"))?;
        let login_lock_max_secs: i64 = env_or("RUCHOIR_LOGIN_LOCK_MAX_SECS", "86400")
            .parse()
            .map_err(|_| ConfigError::Invalid("RUCHOIR_LOGIN_LOCK_MAX_SECS"))?;

        // Coarse per-IP rate limit on the auth surface (backstop above the per-account lockout).
        let auth_rate_burst: u32 = env_or("RUCHOIR_AUTH_RATE_BURST", "20")
            .parse()
            .map_err(|_| ConfigError::Invalid("RUCHOIR_AUTH_RATE_BURST"))?;
        let auth_rate_period_ms: u64 = env_or("RUCHOIR_AUTH_RATE_PERIOD_MS", "500")
            .parse()
            .map_err(|_| ConfigError::Invalid("RUCHOIR_AUTH_RATE_PERIOD_MS"))?;

        // Email. When SMTP_HOST is unset, the mailer logs messages for local dev instead of sending.
        let smtp_host = env_opt("RUCHOIR_SMTP_HOST");
        let smtp_port: u16 = env_or("RUCHOIR_SMTP_PORT", "587")
            .parse()
            .map_err(|_| ConfigError::Invalid("RUCHOIR_SMTP_PORT"))?;
        let smtp_username = env_opt("RUCHOIR_SMTP_USERNAME");
        let smtp_password = env_opt("RUCHOIR_SMTP_PASSWORD");
        let smtp_from = env_or("RUCHOIR_SMTP_FROM", "Ruchoir <no-reply@localhost>");
        let public_base_url = env_or("RUCHOIR_PUBLIC_BASE_URL", "http://localhost:8080");
        let email_verification_ttl_secs: i64 = env_or("RUCHOIR_EMAIL_VERIFICATION_TTL_SECS", "86400")
            .parse()
            .map_err(|_| ConfigError::Invalid("RUCHOIR_EMAIL_VERIFICATION_TTL_SECS"))?;
        let password_reset_ttl_secs: i64 = env_or("RUCHOIR_PASSWORD_RESET_TTL_SECS", "3600")
            .parse()
            .map_err(|_| ConfigError::Invalid("RUCHOIR_PASSWORD_RESET_TTL_SECS"))?;

        let breached_pw_bloom_path = env_opt("RUCHOIR_BREACHED_PW_BLOOM").map(PathBuf::from);

        // WebAuthn relying party. Origin defaults to the public base URL; rp_id to its host.
        let webauthn_rp_id = env_or("RUCHOIR_WEBAUTHN_RP_ID", "localhost");
        let webauthn_origin = env_or("RUCHOIR_WEBAUTHN_ORIGIN", &public_base_url);

        // OIDC connectors: scaffolded but off by default; the authorization-code flow is deferred.
        let oidc_google_enabled: bool = env_or("RUCHOIR_OIDC_GOOGLE_ENABLED", "false")
            .parse()
            .map_err(|_| ConfigError::Invalid("RUCHOIR_OIDC_GOOGLE_ENABLED"))?;
        let oidc_microsoft_enabled: bool = env_or("RUCHOIR_OIDC_MICROSOFT_ENABLED", "false")
            .parse()
            .map_err(|_| ConfigError::Invalid("RUCHOIR_OIDC_MICROSOFT_ENABLED"))?;

        Ok(Self {
            addr: SocketAddr::new(host, port),
            web_dist,
            emoji_dir,
            tls_cert,
            tls_key,
            database_url,
            db_max_connections,
            valkey_url,
            valkey_pool_size,
            auto_migrate,
            argon2_memory_kib,
            argon2_iterations,
            argon2_parallelism,
            session_idle_ttl_secs,
            session_absolute_ttl_secs,
            login_max_failures,
            login_failure_window_secs,
            login_lock_base_secs,
            login_lock_max_secs,
            auth_rate_burst,
            auth_rate_period_ms,
            smtp_host,
            smtp_port,
            smtp_username,
            smtp_password,
            smtp_from,
            public_base_url,
            email_verification_ttl_secs,
            password_reset_ttl_secs,
            breached_pw_bloom_path,
            webauthn_rp_id,
            webauthn_origin,
            oidc_google_enabled,
            oidc_microsoft_enabled,
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
