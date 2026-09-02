//! The real-time router: transports (WebSocket, SSE, typing) and presence.
//!
//! Routes use absolute `/api/v1/...` paths and are merged into the main router in `http.rs`.

use axum::routing::{get, post, put};
use axum::Router;

use crate::state::AppState;

use super::{presence, sse, ws};

/// Build the real-time sub-router.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/v1/realtime/ws", get(ws::ws_handler))
        .route("/api/v1/realtime/sse", get(sse::sse_handler))
        .route("/api/v1/realtime/typing", post(sse::typing_handler))
        .route(
            "/api/v1/spaces/{space_id}/presence",
            get(presence::get_space_presence),
        )
        .route("/api/v1/me/presence", put(presence::set_my_presence))
}
