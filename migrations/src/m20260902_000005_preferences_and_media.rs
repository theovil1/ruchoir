//! Coverage follow-ups from the deep frontend audit.
//!
//! The audit walked every web screen (not just the data seam) and surfaced persistent data the UI
//! writes that the first four migrations did not model. This migration closes the gaps that belong
//! to this schema's own domain; feature-owned gaps (import jobs, in-app notification feed, workspace
//! policy, invitations) are deferred to their own features.
//!
//! - Direct messages carry notification prefs too (the sidebar mutes/levels DMs), so
//!   `dm_participants` gains `notification_level` / `muted` / `hidden`, mirroring `channel_members`.
//! - Spaces have an icon (`spaces.icon_file_id`).
//! - Inline images need intrinsic dimensions and alt text (`file_versions`, `message_attachments`).
//! - Client UI preferences (theme, font, text size, emoji pack, notification and UI state) get a
//!   server home in `user_preferences` so they follow a user across devices.

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // --- Direct-message notification preferences (parallel to channel_members) ---
        manager
            .alter_table(
                Table::alter()
                    .table(DmParticipants::Table)
                    .add_column(
                        ColumnDef::new(DmParticipants::NotificationLevel)
                            .text()
                            .not_null()
                            .default("all")
                            .check(
                                Expr::col(DmParticipants::NotificationLevel)
                                    .is_in(["all", "mentions", "none"]),
                            ),
                    )
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(DmParticipants::Table)
                    .add_column(
                        ColumnDef::new(DmParticipants::Muted)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(DmParticipants::Table)
                    .add_column(
                        ColumnDef::new(DmParticipants::Hidden)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .to_owned(),
            )
            .await?;

        // --- Space icon ---
        manager
            .alter_table(
                Table::alter()
                    .table(Spaces::Table)
                    .add_column(ColumnDef::new(Spaces::IconFileId).uuid().null())
                    .to_owned(),
            )
            .await?;
        manager
            .create_foreign_key(
                ForeignKey::create()
                    .name("fk_spaces_icon_file")
                    .from(Spaces::Table, Spaces::IconFileId)
                    .to(Files::Table, Files::Id)
                    .on_delete(ForeignKeyAction::SetNull)
                    .to_owned(),
            )
            .await?;

        // --- Inline-image intrinsic dimensions + alt text ---
        manager
            .alter_table(
                Table::alter()
                    .table(FileVersions::Table)
                    .add_column(ColumnDef::new(FileVersions::ImageWidth).integer().null())
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(FileVersions::Table)
                    .add_column(ColumnDef::new(FileVersions::ImageHeight).integer().null())
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(MessageAttachments::Table)
                    .add_column(ColumnDef::new(MessageAttachments::AltText).text().null())
                    .to_owned(),
            )
            .await?;

        // --- Per-user client preferences ---
        // Typed columns for the common toggles; two JSON-text blobs (`notifications`, `ui_state`)
        // hold the flexible rest (quiet hours, keyboard shortcuts, onboarding checklist) until the
        // notifications feature firms them up. Stored as text (no jsonb: the `with-json` SeaORM
        // feature is not enabled) and never secret.
        manager
            .create_table(
                Table::create()
                    .table(UserPreferences::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(UserPreferences::UserId)
                            .uuid()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(UserPreferences::Theme).text().null())
                    .col(ColumnDef::new(UserPreferences::Font).text().null())
                    .col(ColumnDef::new(UserPreferences::TextSize).text().null())
                    .col(ColumnDef::new(UserPreferences::EmojiPack).text().null())
                    .col(
                        ColumnDef::new(UserPreferences::EmojiAnimated)
                            .boolean()
                            .null(),
                    )
                    .col(ColumnDef::new(UserPreferences::Notifications).text().null())
                    .col(ColumnDef::new(UserPreferences::UiState).text().null())
                    .col(
                        ColumnDef::new(UserPreferences::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_user_preferences_user")
                            .from(UserPreferences::Table, UserPreferences::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(
                Table::drop()
                    .table(UserPreferences::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;
        manager
            .drop_foreign_key(
                ForeignKey::drop()
                    .name("fk_spaces_icon_file")
                    .table(Spaces::Table)
                    .to_owned(),
            )
            .await?;
        drop_column(
            manager,
            MessageAttachments::Table,
            MessageAttachments::AltText,
        )
        .await?;
        drop_column(manager, FileVersions::Table, FileVersions::ImageHeight).await?;
        drop_column(manager, FileVersions::Table, FileVersions::ImageWidth).await?;
        drop_column(manager, Spaces::Table, Spaces::IconFileId).await?;
        drop_column(manager, DmParticipants::Table, DmParticipants::Hidden).await?;
        drop_column(manager, DmParticipants::Table, DmParticipants::Muted).await?;
        drop_column(
            manager,
            DmParticipants::Table,
            DmParticipants::NotificationLevel,
        )
        .await?;
        Ok(())
    }
}

/// Drop a single column from a table.
async fn drop_column<T, C>(manager: &SchemaManager<'_>, table: T, column: C) -> Result<(), DbErr>
where
    T: IntoTableRef,
    C: IntoIden,
{
    manager
        .alter_table(Table::alter().table(table).drop_column(column).to_owned())
        .await
}

#[derive(DeriveIden)]
enum DmParticipants {
    Table,
    NotificationLevel,
    Muted,
    Hidden,
}

#[derive(DeriveIden)]
enum Spaces {
    Table,
    IconFileId,
}

#[derive(DeriveIden)]
enum Files {
    Table,
    Id,
}

#[derive(DeriveIden)]
enum FileVersions {
    Table,
    ImageWidth,
    ImageHeight,
}

#[derive(DeriveIden)]
enum MessageAttachments {
    Table,
    AltText,
}

#[derive(DeriveIden)]
enum Users {
    Table,
    Id,
}

#[derive(DeriveIden)]
enum UserPreferences {
    Table,
    UserId,
    Theme,
    Font,
    TextSize,
    EmojiPack,
    EmojiAnimated,
    Notifications,
    UiState,
    UpdatedAt,
}
