#!/usr/bin/env bash
# Generate a self-signed TLS certificate for LOCAL DEVELOPMENT ONLY.
#
# Workchat serves plain HTTP by default in dev. To exercise the HTTPS path, generate a
# cert with this script, then build the API with the `tls` feature and point it at the
# files:
#
#   scripts/dev-tls.sh
#   export WORKCHAT_TLS_CERT="$PWD/certs/dev-cert.pem"
#   export WORKCHAT_TLS_KEY="$PWD/certs/dev-key.pem"
#   cargo run -p workchat-api --features tls
#
# Never use these certificates outside local development. `certs/` is gitignored.
set -euo pipefail

OUT_DIR="${1:-certs}"
mkdir -p "$OUT_DIR"

CERT="$OUT_DIR/dev-cert.pem"
KEY="$OUT_DIR/dev-key.pem"

openssl req -x509 -newkey rsa:2048 -sha256 -days 365 -nodes \
  -keyout "$KEY" -out "$CERT" \
  -subj "/CN=localhost/O=Workchat Dev" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

chmod 600 "$KEY"
echo "Wrote $CERT and $KEY (self-signed, localhost, 365 days)."
