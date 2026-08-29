# migrations

Versioned SQL migrations for PostgreSQL, applied in order. The schema (workspaces,
members, channels, DMs, messages, threads, reactions, files, shares) and a dev seed land
later; this directory is a placeholder until then.

Conventions (to be finalized with the schema work):

- One migration per change, prefixed with a zero-padded sequence (e.g. `0001_init.sql`).
- Forward-only; never edit a migration that has shipped.
- Parameterized, reviewed SQL; encryption-at-rest expectations per the security requirements.
