# Development

Local setup and workflow for Workchat. English only, like everything in the repo.

## Prerequisites

- Rust toolchain pinned in `rust-toolchain.toml` (installed automatically by `rustup`).
- Node version pinned in `.nvmrc`, with `pnpm` via Corepack (`corepack enable`).
- Docker + Docker Compose for the full stack.

## First run

```bash
# 1. Configure the environment.
cp .env.example .env   # then fill in values (never commit .env)

# 2. Build the web bundle (static export to apps/web/out).
pnpm install
pnpm --filter @workchat/web build

# 3. Run the API, which serves the bundle at http://localhost:8080.
cargo run -p workchat-api
```

Open http://localhost:8080. The landing page probes `/api/v1/health`. The interactive API
reference is at `/docs` (once the viewer is vendored, see `apps/web/public/vendor/README.md`)
and the raw spec at `/api/openapi.json`.

## Fast iteration

Do not use Docker for the inner dev loop: rebuilding the image compiles the API in release
mode every time. Instead:

- **API:** run it natively for fast incremental debug builds. It serves the web bundle from
  `apps/web/out`. Until the API talks to the databases, no infra is needed.
  ```bash
  cargo run -p workchat-api
  ```
- **Web:** use the dev server for hot reload.
  ```bash
  pnpm --filter @workchat/web dev
  ```
- **`docker compose up` without `--build`** reuses the existing image; only pass `--build`
  when the API source changed. Image rebuilds are cached (BuildKit cache mounts), so after the
  first one only changed code recompiles.

## Full stack with Docker

```bash
docker compose up --build
```

Starts PostgreSQL, Valkey, Garage and the API (which bundles and serves the web export).
Use this for integration and to mirror production, not for the inner loop.

## Optional dev TLS

```bash
scripts/dev-tls.sh
export WORKCHAT_TLS_CERT="$PWD/certs/dev-cert.pem"
export WORKCHAT_TLS_KEY="$PWD/certs/dev-key.pem"
cargo run -p workchat-api --features tls
```

## Quality gates

```bash
cargo fmt --all --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-features
pnpm --filter @workchat/web lint
scripts/check-deps.sh   # outdated + security audit sweep
```

## API reference

The API documents itself. The OpenAPI 3.1 document is generated from the code (route
attributes and typed schemas) and served at:

```
http://localhost:8080/api/openapi.json
```

An interactive reference (Scalar) is served at `http://localhost:8080/docs`. The viewer is
self-hosted (no external CDN, to satisfy the strict CSP), so it must be vendored once:

```bash
SCALAR_VERSION=1.25.28
curl -fsSL \
  "https://cdn.jsdelivr.net/npm/@scalar/api-reference@${SCALAR_VERSION}/dist/browser/standalone.js" \
  -o apps/web/public/vendor/scalar.standalone.js
pnpm --filter @workchat/web build   # copies public/ into the served bundle
```

Then reload `http://localhost:8080/docs`. See `apps/web/public/vendor/README.md` for the
governance note. The raw `/api/openapi.json` works without the viewer.

## Object storage keys (Garage)

The API reaches Garage over the S3 protocol with an access key/secret pair. Unlike the
database and RPC secrets (which services adopt straight from `.env`), **S3 keys must be
created inside Garage**: a key is only valid if Garage knows it. A fresh single-node Garage
also needs a cluster layout and a bucket before it can store anything. Run this once, after
`docker compose up`:

```bash
# Load the S3 vars from your .env.
set -a && . ./.env && set +a

# 1. Assign and apply a single-node cluster layout (grab the node id from `status`).
NODE_ID=$(docker compose exec -T garage /garage status | awk 'NR==3{print $1}')
docker compose exec -T garage /garage layout assign -z dc1 -c 1G "$NODE_ID"
docker compose exec -T garage /garage layout apply --version 1

# 2. Adopt the key pair from your .env (or use `garage key create <name>` to mint a new one).
docker compose exec -T garage /garage key import --yes "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY"

# 3. Create the bucket and grant the key access to it.
docker compose exec -T garage /garage bucket create "$S3_BUCKET"
docker compose exec -T garage /garage bucket allow --read --write --owner "$S3_BUCKET" --key "$S3_ACCESS_KEY_ID"
```

Garage's CLI flags can change between versions; if a command is rejected, check
`docker compose exec garage /garage <subcommand> --help`. Object storage is only exercised
from the file-storage work on, so this setup is optional until then.

## Troubleshooting

- **`postgres` exits with a `/var/lib/postgresql/data (unused mount/volume)` error.** Postgres
  18+ images changed the data location; the volume must mount at `/var/lib/postgresql`. If you
  hit this after an image bump, recreate the volume: `docker compose down -v && docker compose up`.
- **Valkey warns about `vm.overcommit_memory`.** This is a host kernel setting (not namespaced,
  so it cannot be set per-container). On Linux:
  `echo 'vm.overcommit_memory = 1' | sudo tee /etc/sysctl.d/99-workchat-valkey.conf && sudo sysctl --system`.
- **`Bind for 0.0.0.0:8080 failed: port is already allocated`.** Another local process holds
  port 8080. Set `WORKCHAT_HOST_PORT` in your `.env` to a free port (the container still listens
  on 8080 internally), then `docker compose up` again.

## Dependency freshness

Pin the latest **stable** release of every dependency, verified against the live registry
(npm / crates.io), not from memory. A local Claude Code hook reminds you whenever a manifest
changes; `scripts/check-deps.sh` runs the full outdated + audit sweep on demand, and CI runs
the audit on every push.
