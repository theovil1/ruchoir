//! Response and request shapes for the messaging surface.
//!
//! These are kept deliberately close to the web data seam (`apps/web/lib/data/types.ts`) so wiring
//! the client to the real API later is mechanical: a `MessageDto` carries its reactions (with the
//! derived `count`/`mine`), thread `reply_count`, the edited/deleted/pinned/saved flags and resolved
//! mention ids. Unlike the mock, ids are real UUIDs and timestamps are RFC 3339 strings.

use serde::{Deserialize, Serialize};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::files::AttachmentDto;

/// A reaction bucket on a message: the emoji, how many reacted, and whether the caller did.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ReactionDto {
    /// Native Unicode emoji.
    pub emoji: String,
    /// Total reactors for this emoji.
    pub count: i64,
    /// Whether the current caller is one of them (drives the toggle highlight).
    pub mine: bool,
}

/// A message as returned to clients, with its satellites folded in.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct MessageDto {
    pub id: Uuid,
    pub conversation_id: Uuid,
    /// `None` for system messages.
    pub author_id: Option<Uuid>,
    /// Author display name, denormalized for direct rendering; `None` for system messages.
    pub author_name: Option<String>,
    /// `message` or `system`.
    pub kind: String,
    /// Raw markdown (rendered client-side). Blank for a deleted tombstone.
    pub body: String,
    /// System-event discriminator for `system` messages (join/leave and similar).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system_event: Option<String>,
    /// Parent message for a threaded reply; `None` for a root message.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_message_id: Option<Uuid>,
    /// Number of replies in this message's thread.
    pub reply_count: i32,
    /// Whether the message was migrated from another tool.
    pub imported: bool,
    /// Whether the message was edited.
    pub edited: bool,
    /// Whether the message is a deleted tombstone.
    pub deleted: bool,
    /// Whether the message is pinned in its channel.
    pub pinned: bool,
    /// Whether the caller saved (bookmarked) this message.
    pub saved: bool,
    /// RFC 3339 creation timestamp.
    pub created_at: String,
    /// RFC 3339 edit timestamp, when edited.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub edited_at: Option<String>,
    /// Reaction buckets, sorted by first appearance.
    pub reactions: Vec<ReactionDto>,
    /// Resolved mention target user ids.
    pub mentions: Vec<Uuid>,
    /// Files attached to the message, in attachment order.
    pub attachments: Vec<AttachmentDto>,
}

/// A page of messages, newest-last, with an opaque cursor for the previous (older) page.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct MessagePage {
    pub messages: Vec<MessageDto>,
    /// Pass as `before` to fetch the next older page; `None` when the start was reached.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_before: Option<Uuid>,
}

/// A space the caller belongs to: the workspace-switcher entry and the bootstrap the SPA needs to
/// discover its channels (which are queried per space).
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct SpaceDto {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    /// The caller's role in the space: `owner`, `admin`, `member` or `guest`.
    pub role: String,
}

/// A channel in a space's sidebar list.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ChannelDto {
    pub id: Uuid,
    pub name: String,
    /// `public`, `private` or `archived`.
    #[serde(rename = "type")]
    pub channel_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub topic: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub imported: Option<String>,
    /// Per-user sidebar favourite.
    pub favorite: bool,
    /// Count of unread messages for the caller (derived from the read cursor).
    pub unread: i64,
}

/// A direct-message conversation in a space's sidebar list.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct DirectMessageDto {
    pub id: Uuid,
    /// Display label: the other participant, or a comma-joined list for a group.
    pub name: String,
    pub is_group: bool,
    /// Whether the sole counterpart is a bot account.
    pub bot: bool,
    pub unread: i64,
}

/// A user's effective presence as seen by others.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct PresenceDto {
    pub user_id: Uuid,
    /// `active`, `away`, `dnd` or `offline`.
    pub presence: String,
}

// --- Request bodies ---

/// Post a new message (optionally as a threaded reply).
#[derive(Debug, Deserialize, ToSchema)]
pub struct SendMessageRequest {
    pub body: String,
    #[serde(default)]
    pub parent_message_id: Option<Uuid>,
    /// Ids of already-uploaded files to attach (the caller must be able to read each, and each must
    /// belong to the conversation's space).
    #[serde(default)]
    pub attachments: Vec<Uuid>,
}

/// Edit an existing message.
#[derive(Debug, Deserialize, ToSchema)]
pub struct EditMessageRequest {
    pub body: String,
}

/// Advance the caller's read cursor in a conversation.
#[derive(Debug, Deserialize, ToSchema)]
pub struct ReadRequest {
    pub last_read_message_id: Uuid,
}

/// Open (or fetch) a direct-message conversation with a set of users.
#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateDmRequest {
    /// The other participant(s); the caller is added implicitly.
    pub user_ids: Vec<Uuid>,
}

/// A reference to a just-created or fetched conversation.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ConversationRef {
    pub id: Uuid,
}

/// Set (or clear) the caller's manual presence override.
#[derive(Debug, Deserialize, ToSchema)]
pub struct SetPresenceRequest {
    /// `active`, `away`, `dnd`, `invisible`, or `null`/absent to return to automatic presence.
    #[serde(default)]
    pub manual_presence: Option<String>,
}

/// A typing signal for a conversation (SSE-fallback clients POST this; WS clients send it inline).
#[derive(Debug, Deserialize, ToSchema)]
pub struct TypingRequest {
    pub conversation_id: Uuid,
}

/// Format an `OffsetDateTime` as RFC 3339, falling back to an empty string on the impossible error.
pub fn rfc3339(ts: OffsetDateTime) -> String {
    ts.format(&Rfc3339).unwrap_or_default()
}
