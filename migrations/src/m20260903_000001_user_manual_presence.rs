//! Persistent manual presence override on `users`.
//!
//! Live presence is ephemeral (a heartbeat in Valkey, never stored). This column carries only the
//! user's *deliberate* override of it: Active, Away, Do-Not-Disturb or Invisible, surfaced by the
//! account menu in the UI. `NULL` means "auto" (derive presence from the live heartbeat). The
//! effective presence a viewer sees is computed server-side from this column and the heartbeat.
//!
//! It extends the `users` table (owned by the auth migration) through a new migration; the shipped
//! migrations are never edited.

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Users::Table)
                    .add_column(ColumnDef::new(Users::ManualPresence).text().null())
                    .to_owned(),
            )
            .await?;

        // Restrict the override to the known set; `NULL` (auto) is allowed by leaving the column
        // nullable and only checking non-null values.
        manager
            .get_connection()
            .execute_unprepared(
                "ALTER TABLE users ADD CONSTRAINT ck_users_manual_presence \
                 CHECK (manual_presence IS NULL OR manual_presence IN \
                 ('active', 'away', 'dnd', 'invisible'))",
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(
                "ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_manual_presence",
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(Users::Table)
                    .drop_column(Users::ManualPresence)
                    .to_owned(),
            )
            .await?;
        Ok(())
    }
}

/// Local reference to the `users` table (owned by the auth migration) plus the new column.
#[derive(DeriveIden)]
enum Users {
    Table,
    ManualPresence,
}
