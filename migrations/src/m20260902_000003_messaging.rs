//! Messaging: messages and their satellites (reactions, mentions, link previews, attachments,
//! pins, saved bookmarks) plus per-conversation read cursors.
//!
//! Every message points at one `conversation_id`, so channel and DM messaging share the exact same
//! tables. Threads are modelled by a self-referential `parent_message_id` (a NULL parent is a root
//! message); `reply_count` is a denormalized counter maintained by the app. Messages are
//! soft-deleted (`deleted_at` tombstone) so the feed can render "message deleted" and threads keep
//! their shape. Read state is a single cursor per (conversation, user), not a per-message receipt:
//! lighter and privacy-friendly (the "seen by" view stays a pure UI concern).

use sea_orm_migration::prelude::*;

use crate::m20260902_000001_spaces_and_channels::{Channels, Conversations};
use crate::m20260902_000002_files::{FileVersions, Files};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Messages::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(Messages::Id).uuid().not_null().primary_key())
                    .col(ColumnDef::new(Messages::ConversationId).uuid().not_null())
                    // NULL author = system message (join/leave notices, etc.).
                    .col(ColumnDef::new(Messages::AuthorId).uuid().null())
                    .col(
                        ColumnDef::new(Messages::Kind)
                            .text()
                            .not_null()
                            .default("message"),
                    )
                    // Raw markdown; rendering (and sanitization) is a view/service concern.
                    .col(ColumnDef::new(Messages::Body).text().not_null().default(""))
                    // For system messages: which event, so the UI can pick an icon.
                    .col(ColumnDef::new(Messages::SystemEvent).text().null())
                    .col(ColumnDef::new(Messages::ParentMessageId).uuid().null())
                    .col(
                        ColumnDef::new(Messages::ReplyCount)
                            .integer()
                            .not_null()
                            .default(0),
                    )
                    .col(ColumnDef::new(Messages::ImportedSource).text().null())
                    .col(ColumnDef::new(Messages::ExternalRef).text().null())
                    .col(
                        ColumnDef::new(Messages::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .col(
                        ColumnDef::new(Messages::EditedAt)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(Messages::DeletedAt)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .check(Expr::col(Messages::Kind).is_in(["message", "system"]))
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_messages_conversation")
                            .from(Messages::Table, Messages::ConversationId)
                            .to(Conversations::Table, Conversations::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_messages_author")
                            .from(Messages::Table, Messages::AuthorId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_messages_parent")
                            .from(Messages::Table, Messages::ParentMessageId)
                            .to(Messages::Table, Messages::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // Feed pagination by conversation, newest first.
        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx_messages_conversation_created")
                    .table(Messages::Table)
                    .col(Messages::ConversationId)
                    .col(Messages::CreatedAt)
                    .to_owned(),
            )
            .await?;

        // Thread fetch by root message.
        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx_messages_parent")
                    .table(Messages::Table)
                    .col(Messages::ParentMessageId)
                    .to_owned(),
            )
            .await?;

        // Reactions: one row per (message, user, emoji). Emoji is native unicode text.
        manager
            .create_table(
                Table::create()
                    .table(MessageReactions::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(MessageReactions::MessageId)
                            .uuid()
                            .not_null(),
                    )
                    .col(ColumnDef::new(MessageReactions::UserId).uuid().not_null())
                    .col(ColumnDef::new(MessageReactions::Emoji).text().not_null())
                    .col(
                        ColumnDef::new(MessageReactions::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .primary_key(
                        Index::create()
                            .col(MessageReactions::MessageId)
                            .col(MessageReactions::UserId)
                            .col(MessageReactions::Emoji),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_message_reactions_message")
                            .from(MessageReactions::Table, MessageReactions::MessageId)
                            .to(Messages::Table, Messages::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_message_reactions_user")
                            .from(MessageReactions::Table, MessageReactions::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // Mentions resolved to stable user ids, feeding notifications.
        manager
            .create_table(
                Table::create()
                    .table(MessageMentions::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(MessageMentions::MessageId).uuid().not_null())
                    .col(
                        ColumnDef::new(MessageMentions::MentionedUserId)
                            .uuid()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(MessageMentions::MentionType)
                            .text()
                            .not_null()
                            .default("user"),
                    )
                    .primary_key(
                        Index::create()
                            .col(MessageMentions::MessageId)
                            .col(MessageMentions::MentionedUserId),
                    )
                    .check(
                        Expr::col(MessageMentions::MentionType).is_in(["user", "channel", "here"]),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_message_mentions_message")
                            .from(MessageMentions::Table, MessageMentions::MessageId)
                            .to(Messages::Table, Messages::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_message_mentions_user")
                            .from(MessageMentions::Table, MessageMentions::MentionedUserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // Link unfurls: always fetched and stored server-side (never resolved in the browser).
        manager
            .create_table(
                Table::create()
                    .table(MessageLinkPreviews::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(MessageLinkPreviews::Id)
                            .uuid()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(MessageLinkPreviews::MessageId)
                            .uuid()
                            .not_null(),
                    )
                    .col(ColumnDef::new(MessageLinkPreviews::Url).text().not_null())
                    .col(
                        ColumnDef::new(MessageLinkPreviews::Domain)
                            .text()
                            .not_null(),
                    )
                    .col(ColumnDef::new(MessageLinkPreviews::Title).text().null())
                    .col(
                        ColumnDef::new(MessageLinkPreviews::Description)
                            .text()
                            .null(),
                    )
                    // Thumbnail stored as a file, never a hotlinked remote URL.
                    .col(
                        ColumnDef::new(MessageLinkPreviews::ImageFileId)
                            .uuid()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(MessageLinkPreviews::FetchedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .col(
                        ColumnDef::new(MessageLinkPreviews::ExpiresAt)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_message_link_previews_message")
                            .from(MessageLinkPreviews::Table, MessageLinkPreviews::MessageId)
                            .to(Messages::Table, Messages::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_message_link_previews_image")
                            .from(MessageLinkPreviews::Table, MessageLinkPreviews::ImageFileId)
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
                    .name("idx_message_link_previews_message")
                    .table(MessageLinkPreviews::Table)
                    .col(MessageLinkPreviews::MessageId)
                    .to_owned(),
            )
            .await?;

        // Attachments link a message to a file (and the specific version attached).
        manager
            .create_table(
                Table::create()
                    .table(MessageAttachments::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(MessageAttachments::MessageId)
                            .uuid()
                            .not_null(),
                    )
                    .col(ColumnDef::new(MessageAttachments::FileId).uuid().not_null())
                    .col(
                        ColumnDef::new(MessageAttachments::FileVersionId)
                            .uuid()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(MessageAttachments::Position)
                            .integer()
                            .not_null()
                            .default(0),
                    )
                    .primary_key(
                        Index::create()
                            .col(MessageAttachments::MessageId)
                            .col(MessageAttachments::FileId),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_message_attachments_message")
                            .from(MessageAttachments::Table, MessageAttachments::MessageId)
                            .to(Messages::Table, Messages::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_message_attachments_file")
                            .from(MessageAttachments::Table, MessageAttachments::FileId)
                            .to(Files::Table, Files::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_message_attachments_version")
                            .from(MessageAttachments::Table, MessageAttachments::FileVersionId)
                            .to(FileVersions::Table, FileVersions::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        // Pinned messages: attributable and listable per channel.
        manager
            .create_table(
                Table::create()
                    .table(ChannelPins::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(ChannelPins::ChannelId).uuid().not_null())
                    .col(ColumnDef::new(ChannelPins::MessageId).uuid().not_null())
                    .col(ColumnDef::new(ChannelPins::PinnedBy).uuid().null())
                    .col(
                        ColumnDef::new(ChannelPins::PinnedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .primary_key(
                        Index::create()
                            .col(ChannelPins::ChannelId)
                            .col(ChannelPins::MessageId),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_channel_pins_channel")
                            .from(ChannelPins::Table, ChannelPins::ChannelId)
                            .to(Channels::Table, Channels::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_channel_pins_message")
                            .from(ChannelPins::Table, ChannelPins::MessageId)
                            .to(Messages::Table, Messages::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_channel_pins_pinned_by")
                            .from(ChannelPins::Table, ChannelPins::PinnedBy)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        // Per-user saved (bookmarked) messages, feeding the sidebar "Saved" view.
        manager
            .create_table(
                Table::create()
                    .table(UserSavedMessages::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(UserSavedMessages::UserId).uuid().not_null())
                    .col(
                        ColumnDef::new(UserSavedMessages::MessageId)
                            .uuid()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(UserSavedMessages::SavedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .primary_key(
                        Index::create()
                            .col(UserSavedMessages::UserId)
                            .col(UserSavedMessages::MessageId),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_user_saved_messages_user")
                            .from(UserSavedMessages::Table, UserSavedMessages::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_user_saved_messages_message")
                            .from(UserSavedMessages::Table, UserSavedMessages::MessageId)
                            .to(Messages::Table, Messages::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // Read state: one cursor per (conversation, user). No per-message receipts.
        manager
            .create_table(
                Table::create()
                    .table(ReadCursors::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(ReadCursors::ConversationId)
                            .uuid()
                            .not_null(),
                    )
                    .col(ColumnDef::new(ReadCursors::UserId).uuid().not_null())
                    .col(ColumnDef::new(ReadCursors::LastReadMessageId).uuid().null())
                    .col(
                        ColumnDef::new(ReadCursors::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .primary_key(
                        Index::create()
                            .col(ReadCursors::ConversationId)
                            .col(ReadCursors::UserId),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_read_cursors_conversation")
                            .from(ReadCursors::Table, ReadCursors::ConversationId)
                            .to(Conversations::Table, Conversations::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_read_cursors_user")
                            .from(ReadCursors::Table, ReadCursors::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_read_cursors_last_read")
                            .from(ReadCursors::Table, ReadCursors::LastReadMessageId)
                            .to(Messages::Table, Messages::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        for table in [
            ReadCursors::Table.into_table_ref(),
            UserSavedMessages::Table.into_table_ref(),
            ChannelPins::Table.into_table_ref(),
            MessageAttachments::Table.into_table_ref(),
            MessageLinkPreviews::Table.into_table_ref(),
            MessageMentions::Table.into_table_ref(),
            MessageReactions::Table.into_table_ref(),
            Messages::Table.into_table_ref(),
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
pub enum Messages {
    Table,
    Id,
    ConversationId,
    AuthorId,
    Kind,
    Body,
    SystemEvent,
    ParentMessageId,
    ReplyCount,
    ImportedSource,
    ExternalRef,
    CreatedAt,
    EditedAt,
    DeletedAt,
}

#[derive(DeriveIden)]
pub enum MessageReactions {
    Table,
    MessageId,
    UserId,
    Emoji,
    CreatedAt,
}

#[derive(DeriveIden)]
pub enum MessageMentions {
    Table,
    MessageId,
    MentionedUserId,
    MentionType,
}

#[derive(DeriveIden)]
pub enum MessageLinkPreviews {
    Table,
    Id,
    MessageId,
    Url,
    Domain,
    Title,
    Description,
    ImageFileId,
    FetchedAt,
    ExpiresAt,
}

#[derive(DeriveIden)]
pub enum MessageAttachments {
    Table,
    MessageId,
    FileId,
    FileVersionId,
    Position,
}

#[derive(DeriveIden)]
pub enum ChannelPins {
    Table,
    ChannelId,
    MessageId,
    PinnedBy,
    PinnedAt,
}

#[derive(DeriveIden)]
pub enum UserSavedMessages {
    Table,
    UserId,
    MessageId,
    SavedAt,
}

#[derive(DeriveIden)]
pub enum ReadCursors {
    Table,
    ConversationId,
    UserId,
    LastReadMessageId,
    UpdatedAt,
}
