//! The `file_shares` table: a file shared with either a user or a channel.
//!
//! Exactly one of `target_user_id` / `target_channel_id` is set (enforced by a CHECK). Mirrors the
//! Nextcloud `shares.csv` so the importer can reproduce shares faithfully.

use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "file_shares")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub file_id: Uuid,
    pub shared_by: Option<Uuid>,
    pub target_user_id: Option<Uuid>,
    pub target_channel_id: Option<Uuid>,
    /// One of `view`, `edit` (enforced by a CHECK constraint).
    pub permission: String,
    pub created_at: TimeDateTimeWithTimeZone,
    pub expires_at: Option<TimeDateTimeWithTimeZone>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
