//! Migration up/down round-trip against a real PostgreSQL database.
//!
//! This test is **destructive** (it drops and re-applies every table), so it never runs against the
//! ordinary dev database. It is skipped unless `RUCHOIR_TEST_DATABASE_URL` points at a throwaway
//! database dedicated to tests. In CI (no PostgreSQL service) the variable is unset and the test is
//! a no-op, keeping `cargo test` green. To run it locally:
//!
//! ```sh
//! docker compose up -d db
//! createdb -h localhost -U ruchoir ruchoir_test   # or any empty database
//! RUCHOIR_TEST_DATABASE_URL=postgres://ruchoir:ruchoir@localhost:5432/ruchoir_test \
//!   cargo test -p ruchoir-api --test migrations_round_trip -- --nocapture
//! ```

use ruchoir_migration::{Migrator, MigratorTrait};
use sea_orm::Database;

#[tokio::test]
async fn migrations_apply_and_revert_cleanly() {
    let Ok(url) = std::env::var("RUCHOIR_TEST_DATABASE_URL") else {
        eprintln!("skipping migrations_round_trip: RUCHOIR_TEST_DATABASE_URL not set");
        return;
    };

    let db = Database::connect(url)
        .await
        .expect("connect to the test database");

    // Start from a clean, fully-applied schema regardless of prior state.
    Migrator::fresh(&db).await.expect("fresh apply");

    // Full teardown then full re-apply: proves every `down` and every `up` is correct and that the
    // dependency ordering (foreign keys, shared primary keys) holds in both directions.
    Migrator::down(&db, None)
        .await
        .expect("revert all migrations");
    Migrator::up(&db, None)
        .await
        .expect("re-apply all migrations");

    // A second cycle confirms the round-trip is repeatable, not just correct once.
    Migrator::down(&db, None)
        .await
        .expect("revert all migrations again");
    Migrator::up(&db, None)
        .await
        .expect("re-apply all migrations again");
}
