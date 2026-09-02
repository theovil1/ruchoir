//! Read-cursor endpoint: advance the caller's "last read" marker in a conversation.
//!
//! Read state is a single per-(conversation, user) cursor, not a per-message receipt: a deliberate
//! schema choice that is lighter and privacy-friendly. The update is pushed only to the caller's *own*
//! connections, so their unread badges stay in sync across devices without exposing read state to
//! anyone else.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use sea_orm::ActiveValue::Set;
use sea_orm::{ActiveModelTrait, EntityTrait, IntoActiveModel};
use serde::Serialize;
use time::OffsetDateTime;
use uuid::Uuid;

use crate::auth::extract::AuthSession;
use crate::entities::read_cursors;
use crate::realtime::event::RealtimeEnvelope;
use crate::state::AppState;

use super::authz;
use super::dto::ReadRequest;
use super::error::ApiError;
use super::messages::load_message;

/// The payload carried by a `read.updated` event.
#[derive(Debug, Serialize)]
struct ReadEvent {
    conversation_id: Uuid,
    last_read_message_id: Uuid,
}

/// `PUT /api/v1/conversations/{conversation_id}/read`: move the caller's read cursor.
#[utoipa::path(
    put,
    path = "/api/v1/conversations/{conversation_id}/read",
    tag = "messaging",
    params(("conversation_id" = Uuid, Path, description = "Conversation id")),
    request_body = ReadRequest,
    responses(
        (status = 204, description = "Read cursor updated"),
        (status = 400, description = "The message is not in this conversation"),
        (status = 403, description = "No access to the conversation")
    )
)]
pub async fn set_read_cursor(
    State(state): State<AppState>,
    session: AuthSession,
    Path(conversation_id): Path<Uuid>,
    Json(body): Json<ReadRequest>,
) -> Result<StatusCode, ApiError> {
    authz::ensure_conversation_access(&state.db, conversation_id, session.user_id).await?;

    // The cursor must point at a message that actually belongs to this conversation.
    let message = load_message(&state.db, body.last_read_message_id).await?;
    if message.conversation_id != conversation_id {
        return Err(ApiError::BadRequest("message is not in this conversation"));
    }

    let now = OffsetDateTime::now_utc();
    match read_cursors::Entity::find_by_id((conversation_id, session.user_id))
        .one(&state.db)
        .await?
    {
        Some(existing) => {
            let mut active = existing.into_active_model();
            active.last_read_message_id = Set(Some(body.last_read_message_id));
            active.updated_at = Set(now);
            active.update(&state.db).await?;
        }
        None => {
            read_cursors::ActiveModel {
                conversation_id: Set(conversation_id),
                user_id: Set(session.user_id),
                last_read_message_id: Set(Some(body.last_read_message_id)),
                updated_at: Set(now),
            }
            .insert(&state.db)
            .await?;
        }
    }

    // Sync the caller's other devices only.
    state
        .hub
        .publish(
            vec![session.user_id],
            RealtimeEnvelope::read_updated(
                conversation_id,
                ReadEvent {
                    conversation_id,
                    last_read_message_id: body.last_read_message_id,
                },
            ),
        )
        .await;

    Ok(StatusCode::NO_CONTENT)
}
