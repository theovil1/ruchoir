//! The `messages` table: one row per message in any conversation (channel or DM).
//!
//! `author_id` is `None` for system messages. `body` is raw markdown (rendered client-side).
//! Threads use the self-referential `parent_message_id` (a `None` parent is a root message);
//! `reply_count` is a denormalized counter. Soft-deleted via `deleted_at` (tombstone rendering).

use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "messages")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub conversation_id: Uuid,
    pub author_id: Option<Uuid>,
    /// One of `message`, `system` (enforced by a CHECK constraint).
    pub kind: String,
    pub body: String,
    pub system_event: Option<String>,
    pub parent_message_id: Option<Uuid>,
    pub reply_count: i32,
    pub imported_source: Option<String>,
    pub external_ref: Option<String>,
    pub created_at: TimeDateTimeWithTimeZone,
    pub edited_at: Option<TimeDateTimeWithTimeZone>,
    pub deleted_at: Option<TimeDateTimeWithTimeZone>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
