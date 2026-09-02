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
  `webauthn_credentials`, `totp_secrets`, `recovery_codes`. Later migrations append the rest of
  the schema (spaces, channels, messages, files, ...).
