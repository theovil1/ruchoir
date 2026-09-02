//! The `message_mentions` table: mentions resolved to stable user ids, feeding notifications.
//!
//! Composite primary key (`message_id`, `mentioned_user_id`).

use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "message_mentions")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub message_id: Uuid,
    #[sea_orm(primary_key, auto_increment = false)]
    pub mentioned_user_id: Uuid,
    /// One of `user`, `channel`, `here` (enforced by a CHECK constraint).
    pub mention_type: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
