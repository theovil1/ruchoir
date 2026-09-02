//! The `read_cursors` table: one read cursor per (conversation, user).
//!
//! Read state is a single cursor (`last_read_message_id`), not a per-message receipt: lighter and
//! privacy-friendly. The "seen by" view is a pure UI concern, never stored.

use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "read_cursors")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub conversation_id: Uuid,
    #[sea_orm(primary_key, auto_increment = false)]
    pub user_id: Uuid,
    pub last_read_message_id: Option<Uuid>,
    pub updated_at: TimeDateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
