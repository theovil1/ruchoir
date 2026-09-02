//! The `users` table: one row per account.
//!
//! `password_hash` is nullable to leave room for future OIDC-only accounts. `email` is a
//! case-insensitive `citext` column in PostgreSQL, surfaced here as a `String`. Secret material
//! never lives on this row beyond the argon2id password hash.

use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "users")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    #[sea_orm(unique)]
    pub email: String,
    pub display_name: String,
    pub password_hash: Option<String>,
    /// Account lifecycle: `pending`, `active` or `locked`.
    pub status: String,
    pub mfa_enforced: bool,
    pub created_at: TimeDateTimeWithTimeZone,
    pub updated_at: TimeDateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
