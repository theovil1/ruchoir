//! Add a thumbnail object key to file versions.
//!
//! The storage layer generates a downscaled thumbnail for image uploads and stores it as a second
//! object; `thumbnail_key` points at it (NULL for non-images or versions without a thumbnail). The
//! shipped files migration is never edited, so this is a new, additive migration.

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(FileVersions::Table)
                    .add_column(ColumnDef::new(FileVersions::ThumbnailKey).text().null())
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(FileVersions::Table)
                    .drop_column(FileVersions::ThumbnailKey)
                    .to_owned(),
            )
            .await
    }
}

/// Local reference to the `file_versions` table (owned by the files migration) plus the new column.
#[derive(DeriveIden)]
enum FileVersions {
    Table,
    ThumbnailKey,
}
