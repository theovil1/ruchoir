//! HTTP surface: router, health endpoints, static web hosting and security headers.

use std::path::Path;

use axum::http::{header, HeaderName, HeaderValue};
use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;
use tower::ServiceBuilder;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::trace::TraceLayer;
use utoipa::ToSchema;

/// Health payload returned by the liveness and API health endpoints.
#[derive(Debug, Serialize, ToSchema)]
pub(crate) struct Health {
    /// Always `"ok"` when the endpoint responds.
    status: &'static str,
    /// Service identifier.
    service: &'static str,
    /// Semantic version of the running binary.
    version: &'static str,
}

impl Health {
    fn ok() -> Self {
        Self {
            status: "ok",
            service: "ruchoir-api",
            version: env!("CARGO_PKG_VERSION"),
        }
    }
}

/// Liveness probe. Used by container orchestration and load balancers.
#[utoipa::path(
    get,
    path = "/healthz",
    tag = "health",
    responses((status = 200, description = "Service is alive", body = Health))
)]
pub(crate) async fn healthz() -> Json<Health> {
    Json(Health::ok())
}

/// API health endpoint. Kept separate from `/healthz` so it can grow richer
/// dependency checks (database, cache, object storage) without touching liveness.
#[utoipa::path(
    get,
    path = "/api/v1/health",
    tag = "health",
    responses((status = 200, description = "API is healthy", body = Health))
)]
pub(crate) async fn api_health() -> Json<Health> {
    Json(Health::ok())
}

/// Build the full application router.
///
/// Order of concerns:
/// 1. JSON API routes under `/api`, including the generated OpenAPI document.
/// 2. A liveness route at `/healthz`.
/// 3. A static-file fallback that serves the exported web bundle, with SPA-style
///    fallback to `index.html` for client-side routes.
///
/// A conservative baseline of security headers is applied to every response,
/// aligned with the "self-hosted, no external origin" posture
/// (self-hosted, no external origin). It is tightened later (nonce-based CSP,
/// HSTS once TLS is terminated in front of the API).
pub fn router(web_dist: &Path, emoji_dir: Option<&Path>) -> Router {
    let index = web_dist.join("index.html");
    let static_service = ServeDir::new(web_dist).not_found_service(ServeFile::new(index));

    // Content Security Policy: same-origin only.
    //
    // `script-src`/`style-src` allow `'unsafe-inline'` as a documented, TEMPORARY
    // deviation: the Next.js static export emits inline bootstrap/hydration scripts and
    // styles, and a static export cannot use per-request nonces. Without this the client
    // never hydrates. Planned hardening: have the API inject a per-request nonce
    // into index.html and this header, then drop `'unsafe-inline'`.
    let csp = "default-src 'self'; base-uri 'self'; object-src 'none'; \
               frame-ancestors 'none'; img-src 'self' data:; font-src 'self'; \
               style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; \
               connect-src 'self'";

    let mut router = Router::new()
        .route("/healthz", get(healthz))
        .route("/api/v1/health", get(api_health))
        .route("/api/openapi.json", get(crate::openapi::openapi_json));

    // Optional self-hosted emoji pack. `ServeDir` handles path traversal safely and returns 404
    // for missing files, which the client treats as "no asset" and renders the native glyph. The
    // pack lives outside the web bundle so a deployment can omit it.
    //
    // Emoji assets are large and change only when the pack is rebuilt, so they are cached for a week.
    // The client fetches the manifest and the single sprite once, then reuses them; this caps the
    // pack at a couple of requests per client per week instead of one per glyph on every load. The
    // window is intentionally not `immutable`: `sprite.svg`/`manifest.json` keep a stable name across
    // rebuilds, so a bounded max-age lets a rebuilt pack propagate (or a hard refresh forces it).
    if let Some(dir) = emoji_dir {
        let emoji_service = ServeDir::new(dir);
        router = router.nest_service(
            "/emoji",
            ServiceBuilder::new()
                .layer(SetResponseHeaderLayer::overriding(
                    header::CACHE_CONTROL,
                    HeaderValue::from_static("public, max-age=604800"),
                ))
                .service(emoji_service),
        );
    }

    router
        .fallback_service(static_service)
        .layer(set_header(header::CONTENT_SECURITY_POLICY, csp))
        .layer(set_header(header::X_CONTENT_TYPE_OPTIONS, "nosniff"))
        .layer(set_header(header::REFERRER_POLICY, "no-referrer"))
        .layer(set_header(
            HeaderName::from_static("permissions-policy"),
            "geolocation=(), camera=(), microphone=()",
        ))
        .layer(TraceLayer::new_for_http())
}

/// Build a layer that sets a static header value on every response.
fn set_header(name: HeaderName, value: &'static str) -> SetResponseHeaderLayer<HeaderValue> {
    SetResponseHeaderLayer::overriding(name, HeaderValue::from_static(value))
}
