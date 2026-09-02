//! The `message_link_previews` table: server-fetched link unfurls.
//!
//! Titles/domains/thumbnails are fetched and stored server-side, never resolved in the browser, so
//! a viewer can never be used to probe arbitrary URLs. `image_file_id` points at a stored thumbnail,
//! never a hotlinked remote URL.

use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "message_link_previews")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub message_id: Uuid,
    pub url: String,
    pub domain: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub image_file_id: Option<Uuid>,
    pub fetched_at: TimeDateTimeWithTimeZone,
    pub expires_at: Option<TimeDateTimeWithTimeZone>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
