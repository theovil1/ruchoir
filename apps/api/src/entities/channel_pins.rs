//! The `channel_pins` table: attributable, listable pinned messages per channel.
//!
//! Composite primary key (`channel_id`, `message_id`).

use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "channel_pins")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub channel_id: Uuid,
    #[sea_orm(primary_key, auto_increment = false)]
    pub message_id: Uuid,
    pub pinned_by: Option<Uuid>,
    pub pinned_at: TimeDateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
