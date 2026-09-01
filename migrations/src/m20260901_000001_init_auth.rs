//! Initial authentication schema.
//!
//! Creates the identity tables owned by the auth core: `users` and the MFA/recovery satellites
//! (`webauthn_credentials`, `totp_secrets`, `recovery_codes`). Sessions and rate-limit counters
//! deliberately live in Valkey, not here. Later migrations extend the schema with spaces,
//! channels, messages and so on.
//!
//! Notes:
//! - Emails use the `citext` type so uniqueness and lookups are case-insensitive.
//! - Secret material (TOTP secret, recovery-code hash) is stored as `bytea`. The TOTP secret is
//!   AES-GCM-encrypted before it reaches the database; recovery codes are HMAC-SHA-256 digests.
//!   Nothing here is ever a cleartext secret.
//! - Timestamps are `timestamptz` and default to `now()`.

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Case-insensitive email addresses. Idempotent so re-running is safe.
        manager
            .get_connection()
            .execute_unprepared("CREATE EXTENSION IF NOT EXISTS citext;")
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(Users::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(Users::Id).uuid().not_null().primary_key())
                    .col(
                        ColumnDef::new(Users::Email)
                            .custom(Alias::new("citext"))
                            .not_null(),
                    )
                    .col(ColumnDef::new(Users::DisplayName).string().not_null())
                    // Nullable: future OIDC-only accounts may have no local password.
                    .col(ColumnDef::new(Users::PasswordHash).text().null())
                    .col(
                        ColumnDef::new(Users::Status)
                            .string()
                            .not_null()
                            .default("pending"),
                    )
                    .col(
                        ColumnDef::new(Users::MfaEnforced)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(
                        ColumnDef::new(Users::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .col(
                        ColumnDef::new(Users::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx_users_email_unique")
                    .table(Users::Table)
                    .col(Users::Email)
                    .unique()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(WebauthnCredentials::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(WebauthnCredentials::Id)
                            .uuid()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(WebauthnCredentials::UserId)
                            .uuid()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(WebauthnCredentials::CredentialId)
                            .binary()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(WebauthnCredentials::PublicKey)
                            .binary()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(WebauthnCredentials::SignCount)
                            .big_integer()
                            .not_null()
                            .default(0),
                    )
                    .col(ColumnDef::new(WebauthnCredentials::Transports).string().null())
                    .col(ColumnDef::new(WebauthnCredentials::Label).string().null())
                    .col(
                        ColumnDef::new(WebauthnCredentials::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .col(
                        ColumnDef::new(WebauthnCredentials::LastUsedAt)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_webauthn_credentials_user")
                            .from(WebauthnCredentials::Table, WebauthnCredentials::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx_webauthn_credential_id_unique")
                    .table(WebauthnCredentials::Table)
                    .col(WebauthnCredentials::CredentialId)
                    .unique()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(TotpSecrets::Table)
                    .if_not_exists()
                    // One TOTP secret per user: the user id is the primary key.
                    .col(
                        ColumnDef::new(TotpSecrets::UserId)
                            .uuid()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(TotpSecrets::SecretCiphertext)
                            .binary()
                            .not_null(),
                    )
                    .col(ColumnDef::new(TotpSecrets::SecretNonce).binary().not_null())
                    // Null until the user verifies one code during enrollment.
                    .col(
                        ColumnDef::new(TotpSecrets::ConfirmedAt)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(TotpSecrets::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .col(
                        ColumnDef::new(TotpSecrets::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_totp_secrets_user")
                            .from(TotpSecrets::Table, TotpSecrets::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(RecoveryCodes::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(RecoveryCodes::Id)
                            .uuid()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(RecoveryCodes::UserId).uuid().not_null())
                    // HMAC-SHA-256 digest of the high-entropy code, never the code itself.
                    .col(ColumnDef::new(RecoveryCodes::CodeHash).binary().not_null())
                    .col(
                        ColumnDef::new(RecoveryCodes::UsedAt)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(RecoveryCodes::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_recovery_codes_user")
                            .from(RecoveryCodes::Table, RecoveryCodes::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx_recovery_codes_user")
                    .table(RecoveryCodes::Table)
                    .col(RecoveryCodes::UserId)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Drop in reverse dependency order. The `citext` extension is left in place: other
        // schema may rely on it, and dropping extensions is not a per-table concern.
        manager
            .drop_table(Table::drop().table(RecoveryCodes::Table).if_exists().to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(TotpSecrets::Table).if_exists().to_owned())
            .await?;
        manager
            .drop_table(
                Table::drop()
                    .table(WebauthnCredentials::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(Table::drop().table(Users::Table).if_exists().to_owned())
            .await?;
        Ok(())
    }
}

#[derive(DeriveIden)]
enum Users {
    Table,
    Id,
    Email,
    DisplayName,
    PasswordHash,
    Status,
    MfaEnforced,
    CreatedAt,
    UpdatedAt,
}

#[derive(DeriveIden)]
enum WebauthnCredentials {
    Table,
    Id,
    UserId,
    CredentialId,
    PublicKey,
    SignCount,
    Transports,
    Label,
    CreatedAt,
    LastUsedAt,
}

#[derive(DeriveIden)]
enum TotpSecrets {
    Table,
    UserId,
    SecretCiphertext,
    SecretNonce,
    ConfirmedAt,
    CreatedAt,
    UpdatedAt,
}

#[derive(DeriveIden)]
enum RecoveryCodes {
    Table,
    Id,
    UserId,
    CodeHash,
    UsedAt,
    CreatedAt,
}
