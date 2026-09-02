//! The `conversations` table: the supertype shared by channels and direct messages.
//!
//! Every channel and every DM owns exactly one conversation row (shared primary key). Messages,
//! pins and read cursors all reference `conversation_id`, so they never branch on channel vs DM.

use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "conversations")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub space_id: Uuid,
    /// One of `channel`, `direct` (enforced by a CHECK constraint).
    pub kind: String,
    pub created_at: TimeDateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
