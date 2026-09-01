//! PostgreSQL connectivity via SeaORM.
//!
//! Dev connects in plaintext over the trusted Docker network; TLS-to-database is a later
//! hardening concern (and would use the ring-based rustls provider, never AWS `aws-lc-rs`).
//! SQL statement logging is disabled so query parameters (which can carry secrets) never reach
//! the logs.

use std::time::Duration;

use sea_orm::{ConnectOptions, Database, DatabaseConnection, DbErr};

use crate::config::Config;

/// Open the PostgreSQL connection pool from configuration.
pub async fn connect(config: &Config) -> Result<DatabaseConnection, DbErr> {
    let mut options = ConnectOptions::new(config.database_url.clone());
    options
        .max_connections(config.db_max_connections)
        .acquire_timeout(Duration::from_secs(8))
        .sqlx_logging(false);

    Database::connect(options).await
}
