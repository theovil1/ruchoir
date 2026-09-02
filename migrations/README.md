# migrations

Versioned database migrations for PostgreSQL, driven by **SeaORM** (`sea-orm-migration`). This is
a Rust library crate (`ruchoir-migration`), not a folder of raw `.sql` files: migrations are Rust
so they are type-checked and share the project's tooling.

## How they run

- **Development:** the API applies pending migrations on startup (`RUCHOIR_AUTO_MIGRATE=true`,
  the default).
- **Production:** set `RUCHOIR_AUTO_MIGRATE=false` and apply them explicitly before deploying:
  `ruchoir-api migrate`.

## Conventions

- One migration per change, in its own module named `mYYYYMMDD_NNNNNN_description.rs`, registered
  in `src/lib.rs` (`Migrator::migrations()`), applied in order.
- **Forward-only**: never edit a migration that has shipped; add a new one.
- Every migration implements `up` and a best-effort `down`.
- Secrets are always stored encrypted or hashed (`bytea`), never in clear (security requirements).
- The first migration (`m20260901_000001_init_auth`) creates the authentication schema: `users`,
  `webauthn_credentials`, `totp_secrets`, `recovery_codes`.
- The later migrations add the collaboration domain:
  - `m20260902_000001_spaces_and_channels`: `spaces`, `space_members`, `conversations`, `channels`,
    `channel_members`, `dm_conversations`, `dm_participants`. Introduces the **conversation
    supertype**: a channel or a DM each owns one `conversations` row and shares its primary key.
  - `m20260902_000002_files`: `files`, `file_versions`, `file_shares`.
  - `m20260902_000003_messaging`: `messages` (threads via a self-referential parent), plus
    `message_reactions`, `message_mentions`, `message_link_previews`, `message_attachments`,
    `channel_pins`, `user_saved_messages`, `read_cursors`.
  - `m20260902_000004_user_profiles`: extends `users` with global profile fields (`title`,
    `pronouns`, `timezone`, `bio`, `avatar_file_id`, `is_bot`).
  - `m20260902_000005_preferences_and_media`: DM notification prefs on `dm_participants`,
    `spaces.icon_file_id`, inline-image metadata on `file_versions` / `message_attachments`, and the
    `user_preferences` table.
- Enum-like columns are stored as `text` guarded by `CHECK` constraints rather than native
  PostgreSQL enums, so adding a value later is a data change, not an `ALTER TYPE`.
- A destructive up/down round-trip test lives at `apps/api/tests/migrations_round_trip.rs`; it is a
  no-op unless `RUCHOIR_TEST_DATABASE_URL` points at a throwaway test database.
