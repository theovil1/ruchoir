//! Valkey (RESP) connectivity via fred.
//!
//! Backs opaque server sessions today and real-time pub-sub / presence in later lots. Dev speaks
//! plaintext RESP over the trusted Docker network; TLS would use fred's `enable-rustls-ring`
//! feature (ring, not AWS `aws-lc-rs`) when hardening later.

use fred::prelude::{Builder, ClientLike, Config as ValkeyConfig, Error, Pool};

use crate::config::Config;

/// Build and initialize the Valkey connection pool from configuration.
pub async fn connect(config: &Config) -> Result<Pool, Error> {
    let valkey_config = ValkeyConfig::from_url(&config.valkey_url)?;
    let pool = Builder::from_config(valkey_config).build_pool(config.valkey_pool_size)?;
    // Establish the connections up front so a misconfigured Valkey fails fast at startup.
    pool.init().await?;
    Ok(pool)
}
