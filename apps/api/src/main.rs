//! Ruchoir API entrypoint.
//!
//! Initializes structured logging, loads configuration, connects to PostgreSQL and Valkey,
//! applies database migrations (automatically in dev, or via the `migrate` subcommand), and
//! serves an HTTP surface: health endpoints plus the exported static web bundle. Auth,
//! real-time transport and richer business logic build on this foundation in later stages.

mod auth;
mod cache;
mod config;
mod db;
mod entities;
mod http;
mod openapi;
mod state;

use std::net::SocketAddr;
use std::process::ExitCode;
use std::sync::Arc;

use ruchoir_migration::{Migrator, MigratorTrait};
use tracing_subscriber::{fmt, EnvFilter};

use crate::config::Config;
use crate::state::AppState;

#[tokio::main]
async fn main() -> ExitCode {
    // Load a local `.env` for `cargo run` convenience. Real environment variables always win, so
    // this never overrides values injected by Docker / production.
    let _ = dotenvy::dotenv();
    init_tracing();

    let config = match Config::from_env() {
        Ok(cfg) => cfg,
        Err(err) => {
            tracing::error!(error = %err, "invalid configuration");
            return ExitCode::FAILURE;
        }
    };

    match run(config).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(err) => {
            tracing::error!(error = %err, "fatal error");
            ExitCode::FAILURE
        }
    }
}

/// Wire up datastores, run migrations as configured, and either serve or handle a subcommand.
async fn run(config: Config) -> Result<(), Box<dyn std::error::Error>> {
    // Subcommand dispatch. `ruchoir-api migrate` applies pending migrations and exits: this is
    // the explicit, production-safe path. Regular startup serves the app.
    let subcommand = std::env::args().nth(1);

    let db = db::connect(&config).await?;
    tracing::info!("connected to PostgreSQL");

    if subcommand.as_deref() == Some("migrate") {
        tracing::info!("applying database migrations");
        Migrator::up(&db, None).await?;
        tracing::info!("migrations applied");
        return Ok(());
    }

    // In development the API applies pending migrations on boot for convenience. Production sets
    // RUCHOIR_AUTO_MIGRATE=false and runs the `migrate` subcommand explicitly before deploying.
    if config.auto_migrate {
        tracing::info!("auto-migrate enabled; applying pending migrations");
        Migrator::up(&db, None).await?;
    }

    let valkey = cache::connect(&config).await?;
    tracing::info!("connected to Valkey");

    let mailer = auth::mailer::Mailer::from_config(&config)?;
    if config.smtp_host.is_none() {
        tracing::warn!("no SMTP relay configured; emails will be logged, not sent (dev only)");
    }

    let breaches = match &config.breached_pw_bloom_path {
        Some(path) => match auth::breach::BreachFilter::from_path(path) {
            Ok(filter) => {
                tracing::info!(path = %path.display(), "loaded breached-password filter");
                filter
            }
            Err(err) => {
                tracing::warn!(error = %err, "could not load breached-password filter; check disabled");
                auth::breach::BreachFilter::disabled()
            }
        },
        None => {
            tracing::warn!("no breached-password filter configured; breach check disabled");
            auth::breach::BreachFilter::disabled()
        }
    };

    let state = AppState {
        db,
        valkey,
        mailer,
        breaches: Arc::new(breaches),
        config: Arc::new(config),
    };

    tracing::info!(
        addr = %state.config.addr,
        web_dist = %state.config.web_dist.display(),
        "starting ruchoir-api"
    );

    serve(state).await
}

/// Configure structured, filtered logging. Never logs secrets.
fn init_tracing() {
    let filter = EnvFilter::try_from_env("RUST_LOG").unwrap_or_else(|_| EnvFilter::new("info"));
    fmt().with_env_filter(filter).init();
}

/// Serve the application, selecting HTTPS when TLS material is configured and the
/// `tls` feature is built in, otherwise plain HTTP for local development.
async fn serve(state: AppState) -> Result<(), Box<dyn std::error::Error>> {
    let addr = state.config.addr;
    let app = http::router(state.clone());

    #[cfg(feature = "tls")]
    if state.config.tls_enabled() {
        return serve_tls(state, app).await;
    }

    #[cfg(not(feature = "tls"))]
    if state.config.tls_enabled() {
        tracing::warn!(
            "TLS certificate/key are set but this binary was built without the `tls` feature; \
             serving plain HTTP"
        );
    }

    let listener = tokio::net::TcpListener::bind(addr).await?;
    // Report the actual bound address: with RUCHOIR_API_PORT=0 the OS picks a free port.
    let local_addr = listener.local_addr().unwrap_or(addr);
    tracing::info!("listening on http://{}", local_addr);
    // Connect-info is required so the rate limiter can fall back to the connection peer IP when
    // no forwarded-for header is present (direct dev connections).
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await?;
    Ok(())
}

/// Serve over HTTPS using rustls with the community `ring` crypto provider.
#[cfg(feature = "tls")]
async fn serve_tls(state: AppState, app: axum::Router) -> Result<(), Box<dyn std::error::Error>> {
    use axum_server::tls_rustls::RustlsConfig;

    // Install the `ring` provider explicitly. `aws-lc-rs` (the rustls default) is
    // avoided per the no-US-dependency rule.
    rustls::crypto::ring::default_provider()
        .install_default()
        .map_err(|_| "failed to install rustls ring crypto provider")?;

    let cert = state.config.tls_cert.as_ref().expect("tls_enabled checked");
    let key = state.config.tls_key.as_ref().expect("tls_enabled checked");
    let tls = RustlsConfig::from_pem_file(cert, key).await?;

    tracing::info!("listening on https://{}", state.config.addr);
    axum_server::bind_rustls(state.config.addr, tls)
        .serve(app.into_make_service_with_connect_info::<SocketAddr>())
        .await?;
    Ok(())
}

/// Resolve when the process receives Ctrl-C or (on Unix) SIGTERM, enabling a
/// graceful shutdown of in-flight requests.
async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl-C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    tracing::info!("shutdown signal received");
}
