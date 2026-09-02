# AGENTS.md - apps/api

The Rust backend: the single production service. It owns all business logic, auth,
authorization, real-time transport and data access, and it also serves the static web
bundle. See the root `AGENTS.md` for project-wide rules; this file adds crate-specific
context and takes precedence here.

## Layout

- `src/main.rs`   - entrypoint: config load, tracing, datastore connections, migrations, server
  bind (HTTP, or HTTPS with the `tls` feature), graceful shutdown. Also handles the `migrate`
  subcommand.
- `src/config.rs` - environment-driven configuration with dev defaults.
- `src/db.rs`     - PostgreSQL connection pool via SeaORM.
- `src/cache.rs`  - Valkey connection pool via fred.
- `src/state.rs`  - `AppState` (db + Valkey + config) shared with handlers.
- `src/entities/` - SeaORM entity models mapping the database schema.
- `src/auth/`     - the auth core: password hashing (argon2id) + policy with an offline breach
  check, opaque Valkey sessions, the `__Host-` session cookie, the `AuthSession` extractor
  (authorization guard), per-account anti-bruteforce throttle, SMTP mailer + single-use email
  tokens (verification / reset), MFA (TOTP with AES-GCM-encrypted secrets, WebAuthn passkeys,
  HMAC-hashed recovery codes) with a login step-up flow, error type, and the `/api/v1/auth` routes.
- `src/http.rs`   - router, health endpoints (incl. DB/Valkey readiness probe), static web
  hosting (SPA fallback), security headers.
- `src/openapi.rs`- OpenAPI document generated from the code with `utoipa`.

The API needs PostgreSQL and Valkey at startup (see `docker-compose.yml`). Migrations live in the
`ruchoir-migration` crate (`../../migrations`): applied automatically in dev
(`RUCHOIR_AUTO_MIGRATE=true`), or explicitly in prod with `ruchoir-api migrate`.

## Conventions

- Run `cargo fmt` and `cargo clippy --all-targets --all-features -- -D warnings` before any
  commit. CI enforces both.
- Add new routes as typed handlers annotated with `#[utoipa::path(...)]`, then register them
  in `openapi.rs` so `/api/openapi.json` stays complete and in sync.
- The API never trusts the client: authenticate and authorize every request server-side
  (when authentication lands).
- Never log secrets, tokens, passwords or private message content.

> **Known CSP deviation (temporary).** `script-src`/`style-src` include `'unsafe-inline'` in
> `http.rs` because the Next.js static export emits inline hydration scripts/styles and a static
> export cannot use per-request nonces (without it, the client never hydrates). Planned hardening: inject a per-request nonce into `index.html` and the CSP header at the API layer, then
> drop `'unsafe-inline'`.

## Dev TLS (optional)

Plain HTTP by default. For the HTTPS path: `scripts/dev-tls.sh`, then set
`RUCHOIR_TLS_CERT` / `RUCHOIR_TLS_KEY` and build with `--features tls`. TLS uses rustls
with the community `ring` provider (never AWS `aws-lc-rs`), per the no-US-dependency rule.

## Commands

- Run: `cargo run -p ruchoir-api` (loads a local `.env` via dotenvy; real env vars win). Set
  `RUCHOIR_API_PORT=0` for a random free port when 8080 is taken; the bound port is logged.
- Test: `cargo test --all-features`
- Serves `RUCHOIR_WEB_DIST` (defaults to `./apps/web/out`), so build the web app first to
  see the full app locally.
- Optionally serves a self-hosted emoji pack under `/emoji` when `RUCHOIR_EMOJI_DIR` is set
  (layout: `sprite.svg`, `animated/*.png`, `manifest.json`). Kept out of the web bundle because it
  can be large; missing files 404 and the client falls back to native emoji. `ServeDir` guards path
  traversal, and a `Cache-Control: public, max-age=604800` layer caps the pack at a couple of
  requests per client per week (not `immutable`, so a rebuilt pack still propagates).
