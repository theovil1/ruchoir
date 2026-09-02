//! User profile fields surfaced by the UI exploration.
//!
//! The mocked profile card carries a job title, pronouns, timezone and bio, the sidebar shows a bot
//! marker, and real accounts get a stored avatar keyed by user id. These are **global** profile
//! fields (one profile per user) for the MVP; a per-space profile is deferred if it is ever needed.
//! They extend the `users` table owned by the auth migration through a new migration (the shipped
//! auth migration is never edited). `avatar_file_id` references the files table, so this migration
//! runs after the files migration.

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Freeform headline shown on the profile card (distinct from the space/channel role, which
        // governs authorization and lives on the membership tables).
        add_column(manager, ColumnDef::new(Users::Title).text().null()).await?;
        add_column(manager, ColumnDef::new(Users::Pronouns).text().null()).await?;
        add_column(manager, ColumnDef::new(Users::Timezone).text().null()).await?;
        add_column(manager, ColumnDef::new(Users::Bio).text().null()).await?;
        add_column(manager, ColumnDef::new(Users::AvatarFileId).uuid().null()).await?;
        add_column(
            manager,
            ColumnDef::new(Users::IsBot)
                .boolean()
                .not_null()
                .default(false),
        )
        .await?;

        // Avatar points at a stored file (uploaded or generated), never a remote URL.
        manager
            .create_foreign_key(
                ForeignKey::create()
                    .name("fk_users_avatar_file")
                    .from(Users::Table, Users::AvatarFileId)
                    .to(Files::Table, Files::Id)
                    .on_delete(ForeignKeyAction::SetNull)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_foreign_key(
                ForeignKey::drop()
                    .name("fk_users_avatar_file")
                    .table(Users::Table)
                    .to_owned(),
            )
            .await?;
        for column in [
            Users::IsBot,
            Users::AvatarFileId,
            Users::Bio,
            Users::Timezone,
            Users::Pronouns,
            Users::Title,
        ] {
            manager
                .alter_table(
                    Table::alter()
                        .table(Users::Table)
                        .drop_column(column)
                        .to_owned(),
                )
                .await?;
        }
        Ok(())
    }
}

/// Add a single column to `users`.
async fn add_column<C: IntoColumnDef>(manager: &SchemaManager<'_>, column: C) -> Result<(), DbErr> {
    manager
        .alter_table(
            Table::alter()
                .table(Users::Table)
                .add_column(column)
                .to_owned(),
        )
        .await
}

/// Local reference to the `users` table (owned by the auth migration) plus the new profile columns.
#[derive(DeriveIden)]
enum Users {
    Table,
    Title,
    Pronouns,
    Timezone,
    Bio,
    AvatarFileId,
    IsBot,
}

/// Local reference to the `files` table (owned by the files migration).
#[derive(DeriveIden)]
enum Files {
    Table,
    Id,
}
