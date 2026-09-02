//! Typing indicators: ephemeral, authorized, throttled, never stored.
//!
//! A typing signal is the lightest real-time event: it says "this user is composing in this
//! conversation right now". It is authorized like any read (the sender must be able to see the
//! conversation), throttled to at most one accepted signal per `typing_min_interval_ms` per
//! (user, conversation) so a chatty client cannot flood the fan-out, and delivered to the
//! conversation audience minus the sender. Nothing about it touches PostgreSQL.

use fred::interfaces::KeysInterface;
use fred::types::{Expiration, SetOptions};
use serde::Serialize;
use uuid::Uuid;

use crate::messaging::authz;
use crate::state::AppState;

use super::event::RealtimeEnvelope;

/// The payload carried by a `typing` envelope.
#[derive(Debug, Serialize)]
struct TypingPayload {
    conversation_id: Uuid,
    user_id: Uuid,
}

/// Emit a typing signal for `user_id` in `conversation_id`, if allowed and not throttled.
///
/// Failures are swallowed: typing is best-effort, and a caller (a WebSocket frame or the SSE-
/// fallback POST) should never receive an error for it.
pub async fn signal(state: &AppState, user_id: Uuid, conversation_id: Uuid) {
    // Throttle first, so an unauthorized or spammy sender cannot even cause repeated DB lookups.
    if !acquire_slot(state, user_id, conversation_id).await {
        return;
    }

    let access = match authz::ensure_conversation_access(&state.db, conversation_id, user_id).await
    {
        Ok(access) => access,
        Err(_) => return,
    };
    let audience: Vec<Uuid> = match authz::conversation_audience(&state.db, &access).await {
        Ok(members) => members.into_iter().filter(|id| *id != user_id).collect(),
        Err(_) => return,
    };
    if audience.is_empty() {
        return;
    }

    let envelope = RealtimeEnvelope::typing(
        conversation_id,
        TypingPayload {
            conversation_id,
            user_id,
        },
    );
    state.hub.publish(audience, envelope).await;
}

/// Try to claim the per-(user, conversation) throttle slot. Returns `true` when the signal may
/// proceed, `false` when one was already accepted within the window.
async fn acquire_slot(state: &AppState, user_id: Uuid, conversation_id: Uuid) -> bool {
    let key = format!("typing:{user_id}:{conversation_id}");
    let interval = state.config.typing_min_interval_ms.max(1);
    let acquired: Result<Option<String>, _> = state
        .hub
        .valkey()
        .set(
            key,
            "1",
            Some(Expiration::PX(interval)),
            Some(SetOptions::NX),
            false,
        )
        .await;
    matches!(acquired, Ok(Some(_)))
}
