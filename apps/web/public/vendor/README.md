# Vendored third-party assets

Assets here are committed to the repo and served **same-origin** so nothing is fetched
from an external CDN at runtime (sovereignty rule, see `AGENTS.md`). Governance of each
asset is documented below.

## `scalar.standalone.js` (interactive API reference)

- **What:** the Scalar API Reference standalone bundle, rendering the live OpenAPI
  document at `/api/openapi.json` on the `/docs` page.
- **License:** MIT.
- **Governance flag:** Scalar is US-governed (open source). It is allowed here because it
  is locally executed and makes no outbound request at runtime (we set
  `withDefaultFonts:false` so it never pulls fonts from an external CDN). This mirrors the
  R7 arbitration for locally-executed open-source libraries.

### How to vendor it (pin the version)

The bundle is not fetched at build or runtime; vendor it once and commit it. Pick the
version, download from a public registry mirror, and record the resolved version here.

```bash
SCALAR_VERSION=1.25.28
curl -fsSL \
  "https://cdn.jsdelivr.net/npm/@scalar/api-reference@${SCALAR_VERSION}/dist/browser/standalone.js" \
  -o apps/web/public/vendor/scalar.standalone.js
```

Then note the version you pinned: `scalar.standalone.js @ <version>` and verify `/docs`
renders with the network tab showing **no** external requests. Until the file is present,
`/docs` will not render (the rest of the app is unaffected).
