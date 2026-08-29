//! Workchat API entrypoint.
//!
//! For now this is a minimal but real service: it initializes structured logging,
//! loads configuration from the environment, and serves an HTTP surface consisting of
//! health endpoints plus the exported static web bundle. Business logic, real-time
//! transport, auth and data access arrive in later lots.

mod config;
mod http;
mod openapi;

use std::process::ExitCode;

use tracing_subscriber::{fmt, EnvFilter};

use crate::config::Config;

#[tokio::main]
async fn main() -> ExitCode {
    init_tracing();

    let config = match Config::from_env() {
        Ok(cfg) => cfg,
        Err(err) => {
            tracing::error!(error = %err, "invalid configuration");
            return ExitCode::FAILURE;
        }
    };

    tracing::info!(
        addr = %config.addr,
        web_dist = %config.web_dist.display(),
        "starting workchat-api"
    );

    match serve(config).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(err) => {
            tracing::error!(error = %err, "server error");
            ExitCode::FAILURE
        }
    }
}

/// Configure structured, filtered logging. Never logs secrets.
fn init_tracing() {
    let filter = EnvFilter::try_from_env("RUST_LOG").unwrap_or_else(|_| EnvFilter::new("info"));
    fmt().with_env_filter(filter).init();
}

/// Serve the application, selecting HTTPS when TLS material is configured and the
/// `tls` feature is built in, otherwise plain HTTP for local development.
async fn serve(config: Config) -> Result<(), Box<dyn std::error::Error>> {
    let app = http::router(&config.web_dist);

    #[cfg(feature = "tls")]
    if config.tls_enabled() {
        return serve_tls(config, app).await;
    }

    #[cfg(not(feature = "tls"))]
    if config.tls_enabled() {
        tracing::warn!(
            "TLS certificate/key are set but this binary was built without the `tls` feature; \
             serving plain HTTP"
        );
    }

    let listener = tokio::net::TcpListener::bind(config.addr).await?;
    tracing::info!("listening on http://{}", config.addr);
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

/// Serve over HTTPS using rustls with the community `ring` crypto provider.
#[cfg(feature = "tls")]
async fn serve_tls(config: Config, app: axum::Router) -> Result<(), Box<dyn std::error::Error>> {
    use axum_server::tls_rustls::RustlsConfig;

    // Install the `ring` provider explicitly. `aws-lc-rs` (the rustls default) is
    // avoided per the no-US-dependency rule.
    rustls::crypto::ring::default_provider()
        .install_default()
        .map_err(|_| "failed to install rustls ring crypto provider")?;

    let cert = config.tls_cert.as_ref().expect("tls_enabled checked");
    let key = config.tls_key.as_ref().expect("tls_enabled checked");
    let tls = RustlsConfig::from_pem_file(cert, key).await?;

    tracing::info!("listening on https://{}", config.addr);
    axum_server::bind_rustls(config.addr, tls)
        .serve(app.into_make_service())
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
