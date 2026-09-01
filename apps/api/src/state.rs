//! Shared application state passed to Axum handlers.
//!
//! Cloned per request by Axum; every field is cheap to clone (connection handles are internally
//! reference-counted, and the config is behind an `Arc`).

use std::sync::Arc;

use fred::prelude::Pool;
use sea_orm::DatabaseConnection;

use crate::config::Config;

/// Handles to the datastores and configuration that handlers need.
#[derive(Clone)]
pub struct AppState {
    /// PostgreSQL connection pool (source of truth).
    pub db: DatabaseConnection,
    /// Valkey connection pool (sessions, and later pub-sub / presence).
    pub valkey: Pool,
    /// Fully resolved runtime configuration.
    pub config: Arc<Config>,
}
