//! Shared application state passed to Axum handlers.
//!
//! Cloned per request by Axum; every field is cheap to clone (connection handles are internally
//! reference-counted, and the config is behind an `Arc`).

use std::sync::Arc;

use fred::prelude::Pool;
use sea_orm::DatabaseConnection;
use webauthn_rs::Webauthn;

use crate::auth::breach::BreachFilter;
use crate::auth::mailer::Mailer;
use crate::config::Config;
use crate::realtime::Hub;

/// Handles to the datastores and configuration that handlers need.
#[derive(Clone)]
pub struct AppState {
    /// PostgreSQL connection pool (source of truth).
    pub db: DatabaseConnection,
    /// Valkey connection pool (sessions, and later pub-sub / presence).
    pub valkey: Pool,
    /// Outgoing email (or dev-log when no relay is configured).
    pub mailer: Mailer,
    /// Offline breached-password bloom filter (disabled when none is configured).
    pub breaches: Arc<BreachFilter>,
    /// 256-bit data-encryption key for secrets at rest (MFA). Kept out of `Config` so it never
    /// appears in a debug dump.
    pub secret_key: Arc<[u8; 32]>,
    /// WebAuthn relying party, driving the passkey ceremonies.
    pub webauthn: Arc<Webauthn>,
    /// Real-time hub: local connection registry plus the Valkey pub/sub fan-out bridge.
    pub hub: Arc<Hub>,
    /// Fully resolved runtime configuration.
    pub config: Arc<Config>,
}
