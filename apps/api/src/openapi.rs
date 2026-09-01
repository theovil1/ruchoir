//! OpenAPI document generation.
//!
//! The specification is derived from the code (route attributes and typed schemas)
//! with `utoipa`, so the published contract can never drift from the implementation.
//! The raw document is served at `/api/openapi.json`; an interactive viewer is layered
//! on top in the web bundle.

use axum::Json;
use utoipa::OpenApi;

/// Root OpenAPI definition. New route modules register their `#[utoipa::path]`
/// handlers here as the API grows.
#[derive(OpenApi)]
#[openapi(
    info(
        title = "MielApi",
        version = env!("CARGO_PKG_VERSION"),
        description = "MielApi: the Ruchoir HTTP API. Sovereign, open-core workspace: real-time messaging and file sharing.",
        license(name = "AGPL-3.0-only")
    ),
    paths(crate::http::healthz, crate::http::api_health),
    components(schemas(crate::http::Health)),
    tags((name = "health", description = "Liveness and health checks"))
)]
pub struct ApiDoc;

/// Serve the generated OpenAPI 3.1 document as JSON.
pub(crate) async fn openapi_json() -> Json<utoipa::openapi::OpenApi> {
    Json(ApiDoc::openapi())
}
