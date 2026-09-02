//! The `message_attachments` table: links a message to a file (and the specific version attached).
//!
//! Composite primary key (`message_id`, `file_id`). `file_version_id` is `None` to mean "current".

use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "message_attachments")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub message_id: Uuid,
    #[sea_orm(primary_key, auto_increment = false)]
    pub file_id: Uuid,
    pub file_version_id: Option<Uuid>,
    pub position: i32,
    /// Alt text for an inline image attachment (accessibility).
    pub alt_text: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
