# syntax=docker/dockerfile:1.7
# Multi-stage build for the single Workchat production service.
#
# The Rust API also serves the static web bundle, so this image bundles both:
#   1. `web`  - builds the Next.js static export (Node, build-time only).
#   2. `api`  - builds the release Rust binary.
#   3. runtime - a slim image with the binary and the exported web assets.
#
# BuildKit cache mounts (the `--mount=type=cache` lines) persist the cargo registry, the
# Rust `target` dir and the pnpm store across builds, so a rebuild only recompiles the code
# that actually changed instead of every dependency. Build context is the repository root.

# ---------------------------------------------------------------------------
# Stage 1: build the static web bundle.
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS web
WORKDIR /build
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/package.json
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY apps/web ./apps/web
RUN --mount=type=cache,target=/build/apps/web/.next/cache \
    pnpm --filter @workchat/web build

# ---------------------------------------------------------------------------
# Stage 2: build the Rust API (release).
# ---------------------------------------------------------------------------
FROM rust:1.96-slim-bookworm AS api
WORKDIR /build
COPY rust-toolchain.toml Cargo.toml ./
COPY Cargo.lock* ./
COPY apps/api ./apps/api
# Cache the cargo registry/git and the target dir. The binary is copied out of the cached
# target within the same layer (cache mounts are not part of the image filesystem).
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/build/target \
    cargo build --release -p workchat-api \
    && cp target/release/workchat-api /usr/local/bin/workchat-api

# ---------------------------------------------------------------------------
# Stage 3: minimal runtime.
# ---------------------------------------------------------------------------
FROM debian:bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --user-group workchat
WORKDIR /srv/workchat
COPY --from=api /usr/local/bin/workchat-api /usr/local/bin/workchat-api
COPY --from=web /build/apps/web/out /srv/workchat/web
ENV WORKCHAT_API_HOST=0.0.0.0 \
    WORKCHAT_API_PORT=8080 \
    WORKCHAT_WEB_DIST=/srv/workchat/web \
    RUST_LOG=info
USER workchat
EXPOSE 8080
CMD ["workchat-api"]
