//! Ruchoir database migrations, applied in order by [`Migrator`].
//!
//! Migrations are versioned and forward-only: never edit one that has shipped, add a new one.
//! The API applies them automatically in development and through the explicit `migrate`
//! subcommand in production (see `apps/api`).

pub use sea_orm_migration::prelude::*;

mod m20260901_000001_init_auth;

/// The ordered list of migrations. New migrations are appended here.
pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![Box::new(m20260901_000001_init_auth::Migration)]
    }
}
