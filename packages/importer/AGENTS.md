# AGENTS.md - packages/importer

The zero-loss import tooling: official Ruchoir export scripts (run by the customer on
their Nextcloud/Mattermost server) plus the import pipeline that consumes the resulting
encrypted archives. This is the product's signature feature. See root `AGENTS.md` for
project-wide rules.

## Status

Placeholder for the Nextcloud and Mattermost import work. Not implemented yet.

## Principles (when work starts)

- We own the whole chain: our export scripts produce a well-defined, **encrypted** Ruchoir
  archive format; the importer consumes only that format (no fragile source-API scraping).
- Import is **transactional and idempotent**: an interrupted import leaves no half-populated
  workspace; re-running does not duplicate data.
- Archives may contain **secrets** (server config, hashes): never log them in clear, never
  expose them to the client, purge them after import.
- Develop and test against the real fixture in `fixtures/export-ruchoir-2026-08-29/`
  (local, gitignored).
