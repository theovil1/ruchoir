//! Spaces, membership and channels: the collaboration skeleton on top of the auth core.
//!
//! This migration introduces the **conversation supertype**: a single `conversations` row is the
//! common parent of both a channel and a direct-message thread. Channels and DMs share their
//! parent's primary key (`channels.id = conversations.id`), so every downstream table
//! (messages, pins, read cursors, reactions, ...) references one `conversation_id` and never has
//! to branch on "channel or DM". Enum-like columns are stored as `text` guarded by `CHECK`
//! constraints rather than native PostgreSQL enums: adding a value later is a plain data change,
//! not an `ALTER TYPE` migration.
//!
//! Foreign keys cascade on delete unless a column is provenance-only (`created_by`, `invited_by`),
//! which are set to NULL so history survives a user deletion.

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Spaces (workspaces): the top-level tenant boundary. `slug` is a case-insensitive citext
        // (the extension is created by the auth migration) so lookups and uniqueness ignore case.
        manager
            .create_table(
                Table::create()
                    .table(Spaces::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(Spaces::Id).uuid().not_null().primary_key())
                    .col(ColumnDef::new(Spaces::Name).string().not_null())
                    .col(
                        ColumnDef::new(Spaces::Slug)
                            .custom(Alias::new("citext"))
                            .not_null(),
                    )
                    // Provenance: keep the space if its creator is later deleted.
                    .col(ColumnDef::new(Spaces::CreatedBy).uuid().null())
                    .col(
                        ColumnDef::new(Spaces::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .col(
                        ColumnDef::new(Spaces::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_spaces_created_by")
                            .from(Spaces::Table, Spaces::CreatedBy)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx_spaces_slug_unique")
                    .table(Spaces::Table)
                    .col(Spaces::Slug)
                    .unique()
                    .to_owned(),
            )
            .await?;

        // Space membership with a role. Composite primary key (space, user): a user is a member of
        // a space at most once.
        manager
            .create_table(
                Table::create()
                    .table(SpaceMembers::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(SpaceMembers::SpaceId).uuid().not_null())
                    .col(ColumnDef::new(SpaceMembers::UserId).uuid().not_null())
                    .col(
                        ColumnDef::new(SpaceMembers::Role)
                            .text()
                            .not_null()
                            .default("member"),
                    )
                    .col(ColumnDef::new(SpaceMembers::InvitedBy).uuid().null())
                    .col(
                        ColumnDef::new(SpaceMembers::JoinedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .primary_key(
                        Index::create()
                            .col(SpaceMembers::SpaceId)
                            .col(SpaceMembers::UserId),
                    )
                    .check(
                        Expr::col(SpaceMembers::Role).is_in(["owner", "admin", "member", "guest"]),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_space_members_space")
                            .from(SpaceMembers::Table, SpaceMembers::SpaceId)
                            .to(Spaces::Table, Spaces::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_space_members_user")
                            .from(SpaceMembers::Table, SpaceMembers::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_space_members_invited_by")
                            .from(SpaceMembers::Table, SpaceMembers::InvitedBy)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        // The conversation supertype. Every channel and every DM owns exactly one row here.
        manager
            .create_table(
                Table::create()
                    .table(Conversations::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Conversations::Id)
                            .uuid()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Conversations::SpaceId).uuid().not_null())
                    .col(ColumnDef::new(Conversations::Kind).text().not_null())
                    .col(
                        ColumnDef::new(Conversations::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .check(Expr::col(Conversations::Kind).is_in(["channel", "direct"]))
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_conversations_space")
                            .from(Conversations::Table, Conversations::SpaceId)
                            .to(Spaces::Table, Spaces::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // Channels: the "channel" flavour of a conversation. `id` is both the primary key and a
        // foreign key onto the parent conversation (shared-primary-key inheritance).
        manager
            .create_table(
                Table::create()
                    .table(Channels::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(Channels::Id).uuid().not_null().primary_key())
                    .col(ColumnDef::new(Channels::SpaceId).uuid().not_null())
                    .col(
                        ColumnDef::new(Channels::Name)
                            .custom(Alias::new("citext"))
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(Channels::Type)
                            .text()
                            .not_null()
                            .default("public"),
                    )
                    .col(ColumnDef::new(Channels::Topic).text().null())
                    .col(ColumnDef::new(Channels::CreatedBy).uuid().null())
                    .col(
                        ColumnDef::new(Channels::ArchivedAt)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    // Import provenance: stamped by the Nextcloud/Mattermost importers.
                    .col(ColumnDef::new(Channels::ImportedSource).text().null())
                    .col(ColumnDef::new(Channels::ExternalRef).text().null())
                    .col(
                        ColumnDef::new(Channels::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .check(Expr::col(Channels::Type).is_in(["public", "private", "archived"]))
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_channels_conversation")
                            .from(Channels::Table, Channels::Id)
                            .to(Conversations::Table, Conversations::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_channels_space")
                            .from(Channels::Table, Channels::SpaceId)
                            .to(Spaces::Table, Spaces::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_channels_created_by")
                            .from(Channels::Table, Channels::CreatedBy)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        // A channel name is unique within its space.
        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx_channels_space_name_unique")
                    .table(Channels::Table)
                    .col(Channels::SpaceId)
                    .col(Channels::Name)
                    .unique()
                    .to_owned(),
            )
            .await?;

        // Channel membership (private-channel access + per-user notification prefs). Composite
        // primary key (channel, user).
        manager
            .create_table(
                Table::create()
                    .table(ChannelMembers::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(ChannelMembers::ChannelId).uuid().not_null())
                    .col(ColumnDef::new(ChannelMembers::UserId).uuid().not_null())
                    .col(
                        ColumnDef::new(ChannelMembers::Role)
                            .text()
                            .not_null()
                            .default("member"),
                    )
                    .col(
                        ColumnDef::new(ChannelMembers::NotificationLevel)
                            .text()
                            .not_null()
                            .default("all"),
                    )
                    .col(
                        ColumnDef::new(ChannelMembers::Muted)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    // Per-user sidebar favourite (the mock's `fav` flag on a channel).
                    .col(
                        ColumnDef::new(ChannelMembers::Favorite)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(
                        ColumnDef::new(ChannelMembers::JoinedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .primary_key(
                        Index::create()
                            .col(ChannelMembers::ChannelId)
                            .col(ChannelMembers::UserId),
                    )
                    .check(Expr::col(ChannelMembers::Role).is_in(["owner", "admin", "member"]))
                    .check(
                        Expr::col(ChannelMembers::NotificationLevel)
                            .is_in(["all", "mentions", "none"]),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_channel_members_channel")
                            .from(ChannelMembers::Table, ChannelMembers::ChannelId)
                            .to(Channels::Table, Channels::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_channel_members_user")
                            .from(ChannelMembers::Table, ChannelMembers::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // Direct-message conversations: the "direct" flavour. 1:1 or small group (is_group).
        manager
            .create_table(
                Table::create()
                    .table(DmConversations::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(DmConversations::Id)
                            .uuid()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(DmConversations::SpaceId).uuid().not_null())
                    .col(
                        ColumnDef::new(DmConversations::IsGroup)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(ColumnDef::new(DmConversations::CreatedBy).uuid().null())
                    .col(
                        ColumnDef::new(DmConversations::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_dm_conversations_conversation")
                            .from(DmConversations::Table, DmConversations::Id)
                            .to(Conversations::Table, Conversations::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_dm_conversations_space")
                            .from(DmConversations::Table, DmConversations::SpaceId)
                            .to(Spaces::Table, Spaces::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_dm_conversations_created_by")
                            .from(DmConversations::Table, DmConversations::CreatedBy)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        // Who is in a DM. Composite primary key (dm, user).
        manager
            .create_table(
                Table::create()
                    .table(DmParticipants::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(DmParticipants::DmId).uuid().not_null())
                    .col(ColumnDef::new(DmParticipants::UserId).uuid().not_null())
                    .col(
                        ColumnDef::new(DmParticipants::AddedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .primary_key(
                        Index::create()
                            .col(DmParticipants::DmId)
                            .col(DmParticipants::UserId),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_dm_participants_dm")
                            .from(DmParticipants::Table, DmParticipants::DmId)
                            .to(DmConversations::Table, DmConversations::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_dm_participants_user")
                            .from(DmParticipants::Table, DmParticipants::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Reverse dependency order.
        for table in [
            DmParticipants::Table.into_table_ref(),
            DmConversations::Table.into_table_ref(),
            ChannelMembers::Table.into_table_ref(),
            Channels::Table.into_table_ref(),
            Conversations::Table.into_table_ref(),
            SpaceMembers::Table.into_table_ref(),
            Spaces::Table.into_table_ref(),
        ] {
            manager
                .drop_table(Table::drop().table(table).if_exists().to_owned())
                .await?;
        }
        Ok(())
    }
}

/// Local reference to the `users` table owned by the auth migration. Redeclared here (rather than
/// importing it) so the shipped auth migration stays untouched, per the forward-only rule.
#[derive(DeriveIden)]
enum Users {
    Table,
    Id,
}

#[derive(DeriveIden)]
pub enum Spaces {
    Table,
    Id,
    Name,
    Slug,
    CreatedBy,
    CreatedAt,
    UpdatedAt,
}

#[derive(DeriveIden)]
pub enum SpaceMembers {
    Table,
    SpaceId,
    UserId,
    Role,
    InvitedBy,
    JoinedAt,
}

#[derive(DeriveIden)]
pub enum Conversations {
    Table,
    Id,
    SpaceId,
    Kind,
    CreatedAt,
}

#[derive(DeriveIden)]
pub enum Channels {
    Table,
    Id,
    SpaceId,
    Name,
    Type,
    Topic,
    CreatedBy,
    ArchivedAt,
    ImportedSource,
    ExternalRef,
    CreatedAt,
}

#[derive(DeriveIden)]
pub enum ChannelMembers {
    Table,
    ChannelId,
    UserId,
    Role,
    NotificationLevel,
    Muted,
    Favorite,
    JoinedAt,
}

#[derive(DeriveIden)]
pub enum DmConversations {
    Table,
    Id,
    SpaceId,
    IsGroup,
    CreatedBy,
    CreatedAt,
}

#[derive(DeriveIden)]
pub enum DmParticipants {
    Table,
    DmId,
    UserId,
    AddedAt,
}
