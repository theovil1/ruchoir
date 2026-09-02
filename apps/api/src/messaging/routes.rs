//! The messaging router: messages, threads, reactions, read cursors, pins, saved and DMs.
//!
//! Routes use absolute `/api/v1/...` paths and are merged into the main router in `http.rs`
//! (alongside the existing `/api/v1/health` route and the `/api/v1/auth` nest), which avoids the
//! path-overlap a second `/api/v1` nest would introduce.

use axum::routing::{get, patch, post, put};
use axum::Router;

use crate::state::AppState;

use super::{conversations, messages, pins, reactions, read, saved};

/// Build the messaging sub-router.
pub fn router() -> Router<AppState> {
    Router::new()
        // Messages and threads.
        .route(
            "/api/v1/conversations/{conversation_id}/messages",
            get(messages::list_messages).post(messages::send_message),
        )
        .route(
            "/api/v1/messages/{message_id}/replies",
            get(messages::list_replies),
        )
        .route(
            "/api/v1/messages/{message_id}",
            patch(messages::edit_message).delete(messages::delete_message),
        )
        // Reactions.
        .route(
            "/api/v1/messages/{message_id}/reactions/{emoji}",
            put(reactions::add_reaction).delete(reactions::remove_reaction),
        )
        // Read cursor.
        .route(
            "/api/v1/conversations/{conversation_id}/read",
            put(read::set_read_cursor),
        )
        // Pins.
        .route("/api/v1/channels/{channel_id}/pins", get(pins::list_pins))
        .route(
            "/api/v1/channels/{channel_id}/pins/{message_id}",
            put(pins::pin_message).delete(pins::unpin_message),
        )
        // Saved messages.
        .route("/api/v1/me/saved", get(saved::list_saved))
        .route(
            "/api/v1/messages/{message_id}/save",
            put(saved::save_message).delete(saved::unsave_message),
        )
        // Channels, DMs and DM creation.
        .route(
            "/api/v1/spaces/{space_id}/channels",
            get(conversations::list_channels),
        )
        .route(
            "/api/v1/spaces/{space_id}/dms",
            get(conversations::list_dms),
        )
        .route(
            "/api/v1/spaces/{space_id}/dm",
            post(conversations::create_dm),
        )
}
