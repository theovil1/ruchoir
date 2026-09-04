//! The `file_versions` table: immutable version records for a file.
//!
//! `storage_key` stays `None` until the bytes are uploaded to Garage/S3. `content_hash` is the raw
//! digest bytes. Version numbers are unique per file.

use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "file_versions")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub file_id: Uuid,
    pub version_no: i32,
    pub size_bytes: i64,
    pub content_hash: Option<Vec<u8>>,
    pub storage_key: Option<String>,
    /// Object key of the downscaled thumbnail for image versions; `None` otherwise.
    pub thumbnail_key: Option<String>,
    pub mime_type: String,
    /// Intrinsic pixel dimensions for image versions (used to reserve layout space; `None` for
    /// non-image files).
    pub image_width: Option<i32>,
    pub image_height: Option<i32>,
    pub created_by: Option<Uuid>,
    pub created_at: TimeDateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
