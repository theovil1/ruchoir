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
    paths(
        crate::http::healthz,
        crate::http::api_health,
        crate::auth::routes::register,
        crate::auth::routes::login,
        crate::auth::routes::logout,
        crate::auth::routes::logout_all,
        crate::auth::routes::current_session,
        crate::auth::routes::verify_email_request,
        crate::auth::routes::verify_email_confirm,
        crate::auth::routes::password_reset_request,
        crate::auth::routes::password_reset_confirm,
        crate::auth::routes::totp_enroll,
        crate::auth::routes::totp_confirm,
        crate::auth::routes::recovery_generate,
        crate::auth::routes::totp_verify,
        crate::auth::routes::recovery_verify,
        crate::auth::routes::oidc_providers
    ),
    components(schemas(
        crate::http::Health,
        crate::http::ApiHealth,
        crate::auth::routes::RegisterRequest,
        crate::auth::routes::LoginRequest,
        crate::auth::routes::UserSummary,
        crate::auth::routes::EmailRequest,
        crate::auth::routes::TokenRequest,
        crate::auth::routes::PasswordResetConfirm,
        crate::auth::routes::TotpEnrollResponse,
        crate::auth::routes::TotpConfirm,
        crate::auth::routes::RecoveryCodesResponse,
        crate::auth::routes::MfaRequired,
        crate::auth::routes::MfaCodeRequest,
        crate::auth::routes::OidcProviders
    )),
    tags(
        (name = "health", description = "Liveness and health checks"),
        (name = "auth", description = "Registration, login, sessions")
    )
)]
pub struct ApiDoc;

/// Serve the generated OpenAPI 3.1 document as JSON.
pub(crate) async fn openapi_json() -> Json<utoipa::openapi::OpenApi> {
    Json(ApiDoc::openapi())
}
