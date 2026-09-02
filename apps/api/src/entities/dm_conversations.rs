//! The `dm_conversations` table: the "direct" flavour of a conversation (1:1 or small group).
//!
//! `id` is both the primary key and a foreign key onto the parent conversation.

use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "dm_conversations")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub space_id: Uuid,
    pub is_group: bool,
    pub created_by: Option<Uuid>,
    pub created_at: TimeDateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
