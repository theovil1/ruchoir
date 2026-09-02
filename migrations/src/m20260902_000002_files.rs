//! Files, versions and shares: the storage model shared by the files feature and the importers.
//!
//! This lays the full relational shape; object storage later fills `file_versions.storage_key` with
//! the Garage/S3 object key once bytes are actually uploaded. `files.current_version_id` is an
//! app-maintained
//! pointer with **no** database foreign key on purpose: a real FK would form a mutual cycle with
//! `file_versions.file_id`, which complicates every insert and teardown for no integrity gain.
//! `file_shares` mirrors the Nextcloud `shares.csv` (a share targets either a user or a channel).

use sea_orm_migration::prelude::*;

use crate::m20260902_000001_spaces_and_channels::{Conversations, Spaces};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Files and folders. A folder is a `files` row with kind = 'folder'; the tree is expressed
        // through the self-referential `parent_folder_id`.
        manager
            .create_table(
                Table::create()
                    .table(Files::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(Files::Id).uuid().not_null().primary_key())
                    .col(ColumnDef::new(Files::SpaceId).uuid().not_null())
                    .col(ColumnDef::new(Files::OwnerId).uuid().null())
                    .col(ColumnDef::new(Files::Name).string().not_null())
                    .col(
                        ColumnDef::new(Files::Kind)
                            .text()
                            .not_null()
                            .default("file"),
                    )
                    .col(ColumnDef::new(Files::ParentFolderId).uuid().null())
                    // App-maintained pointer to the active version (no FK; see module docs).
                    .col(ColumnDef::new(Files::CurrentVersionId).uuid().null())
                    .col(
                        ColumnDef::new(Files::SizeBytes)
                            .big_integer()
                            .not_null()
                            .default(0),
                    )
                    .col(ColumnDef::new(Files::ImportedSource).text().null())
                    .col(ColumnDef::new(Files::ExternalRef).text().null())
                    .col(
                        ColumnDef::new(Files::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .col(
                        ColumnDef::new(Files::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    // Soft delete: kept so a message attachment can still render a tombstone.
                    .col(
                        ColumnDef::new(Files::DeletedAt)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .check(Expr::col(Files::Kind).is_in([
                        "file",
                        "file-text",
                        "file-spreadsheet",
                        "image",
                        "folder",
                    ]))
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_files_space")
                            .from(Files::Table, Files::SpaceId)
                            .to(Spaces::Table, Spaces::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_files_owner")
                            .from(Files::Table, Files::OwnerId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_files_parent_folder")
                            .from(Files::Table, Files::ParentFolderId)
                            .to(Files::Table, Files::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx_files_space_parent")
                    .table(Files::Table)
                    .col(Files::SpaceId)
                    .col(Files::ParentFolderId)
                    .to_owned(),
            )
            .await?;

        // Immutable version records. `storage_key` stays NULL until the bytes are uploaded to Garage.
        manager
            .create_table(
                Table::create()
                    .table(FileVersions::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(FileVersions::Id)
                            .uuid()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(FileVersions::FileId).uuid().not_null())
                    .col(ColumnDef::new(FileVersions::VersionNo).integer().not_null())
                    .col(
                        ColumnDef::new(FileVersions::SizeBytes)
                            .big_integer()
                            .not_null()
                            .default(0),
                    )
                    .col(ColumnDef::new(FileVersions::ContentHash).binary().null())
                    .col(ColumnDef::new(FileVersions::StorageKey).text().null())
                    .col(
                        ColumnDef::new(FileVersions::MimeType)
                            .text()
                            .not_null()
                            .default("application/octet-stream"),
                    )
                    .col(ColumnDef::new(FileVersions::CreatedBy).uuid().null())
                    .col(
                        ColumnDef::new(FileVersions::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_file_versions_file")
                            .from(FileVersions::Table, FileVersions::FileId)
                            .to(Files::Table, Files::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_file_versions_created_by")
                            .from(FileVersions::Table, FileVersions::CreatedBy)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        // Version numbers are unique per file.
        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx_file_versions_file_no_unique")
                    .table(FileVersions::Table)
                    .col(FileVersions::FileId)
                    .col(FileVersions::VersionNo)
                    .unique()
                    .to_owned(),
            )
            .await?;

        // Shares. A share targets exactly one of a user or a channel (conversation), enforced by a
        // CHECK. Mirrors the Nextcloud export so the importer can reproduce shares faithfully.
        manager
            .create_table(
                Table::create()
                    .table(FileShares::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(FileShares::Id)
                            .uuid()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(FileShares::FileId).uuid().not_null())
                    .col(ColumnDef::new(FileShares::SharedBy).uuid().null())
                    .col(ColumnDef::new(FileShares::TargetUserId).uuid().null())
                    .col(ColumnDef::new(FileShares::TargetChannelId).uuid().null())
                    .col(
                        ColumnDef::new(FileShares::Permission)
                            .text()
                            .not_null()
                            .default("view"),
                    )
                    .col(
                        ColumnDef::new(FileShares::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .col(
                        ColumnDef::new(FileShares::ExpiresAt)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .check(Expr::col(FileShares::Permission).is_in(["view", "edit"]))
                    // Exactly one target: user XOR channel.
                    .check(Expr::cust(
                        "(target_user_id IS NOT NULL) <> (target_channel_id IS NOT NULL)",
                    ))
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_file_shares_file")
                            .from(FileShares::Table, FileShares::FileId)
                            .to(Files::Table, Files::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_file_shares_shared_by")
                            .from(FileShares::Table, FileShares::SharedBy)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_file_shares_target_user")
                            .from(FileShares::Table, FileShares::TargetUserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_file_shares_target_channel")
                            .from(FileShares::Table, FileShares::TargetChannelId)
                            .to(Conversations::Table, Conversations::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        for table in [
            FileShares::Table.into_table_ref(),
            FileVersions::Table.into_table_ref(),
            Files::Table.into_table_ref(),
        ] {
            manager
                .drop_table(Table::drop().table(table).if_exists().to_owned())
                .await?;
        }
        Ok(())
    }
}

/// Local reference to the `users` table owned by the auth migration (see the spaces migration).
#[derive(DeriveIden)]
enum Users {
    Table,
    Id,
}

#[derive(DeriveIden)]
pub enum Files {
    Table,
    Id,
    SpaceId,
    OwnerId,
    Name,
    Kind,
    ParentFolderId,
    CurrentVersionId,
    SizeBytes,
    ImportedSource,
    ExternalRef,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}

#[derive(DeriveIden)]
pub enum FileVersions {
    Table,
    Id,
    FileId,
    VersionNo,
    SizeBytes,
    ContentHash,
    StorageKey,
    MimeType,
    CreatedBy,
    CreatedAt,
}

#[derive(DeriveIden)]
pub enum FileShares {
    Table,
    Id,
    FileId,
    SharedBy,
    TargetUserId,
    TargetChannelId,
    Permission,
    CreatedAt,
    ExpiresAt,
}
