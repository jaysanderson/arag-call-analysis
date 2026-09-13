# White-labelling

A partner can ship this product under their own identity **without a fork, a rebuild or a code
change**. Every user-visible identity element is read from the environment at boot, editable in
the product afterwards, and served from one public endpoint.

## The settings model

Read this first, because it governs everything below.

**Environment variables are defaults; the settings store is the authority.** The `BRAND_*`
variables in the next table set what a deployment *boots* with. From then on the same values are
editable in **Settings → Branding**, are persisted to `DATA_DIR/settings.json`, and take effect on
the next request with no restart. Once branding has been edited the store wins, and changing a
`BRAND_*` variable moves nothing until the section is reset.

| | |
|---|---|
| Read | `GET /api/v1/settings` (public, no secrets) and `GET /api/v1/branding` (public) |
| Write | `PUT /api/v1/settings/branding` — admin token required |
| Reset | `DELETE /api/v1/settings/branding` — restores the `BRAND_*` values the deployment booted with |
| Logo | `POST /api/v1/settings/logo` (multipart) and `DELETE /api/v1/settings/logo` — admin token required |

`GET /api/v1/settings` reports which sections the store is currently driving in its `overridden`
array, so an operator looking at a value can tell whether changing the deployment's environment
would move it.

A worked edit:

```bash
export BASE=http://localhost:3000

curl -s -X PUT "$BASE/api/v1/settings/branding" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
        "productName": "Northwind Call IQ",
        "tagline": "Conversation intelligence for insurers",
        "primaryColor": "#7c3aed",
        "accentColor": "#0ea5e9",
        "poweredBy": false,
        "footerText": "© Northwind Analytics. All rights reserved.",
        "supportUrl": "https://support.northwind.example"
      }' | jq '.branding'
```

The body is a **patch**: only the keys present are changed, and an unrecognised key is rejected
with a 400 rather than silently ignored, so a typo in a partner's automation fails loudly. The
response is the whole settings view, not just the section that changed. The very next page render
uses the new identity.

Putting it back:

```bash
curl -s -X DELETE "$BASE/api/v1/settings/branding" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.branding.productName'
```

"Reset to environment default" in Settings → Branding is this call.

## The variables

| Variable | Default | What it changes |
|---|---|---|
| `BRAND_PRODUCT_NAME` | `Call Analysis` | The wordmark, the browser tab title, the admin console title, and the `%s · <name>` page-title template. |
| `BRAND_TAGLINE` | `Contact centre intelligence` | The line beside the wordmark. Set it to an empty string to remove it. |
| `BRAND_LOGO_URL` | *(empty)* | An image to use **instead of** the built-in wordmark. An absolute `https://…` URL, or a path such as `/branding/logo.svg` served from `DATA_DIR/branding/`. Empty renders the wordmark set in your product name. |
| `BRAND_PRIMARY_COLOR` | `#2b2bb2` | Primary action colour: buttons, links, active navigation, chart bars. |
| `BRAND_ACCENT_COLOR` | `#00b563` | Accent colour: positive states, highlights, the cross-sell funnel. |
| `BRAND_POWERED_BY` | `1` | `0` hides the Progress Agentic RAG band and the "Built on Progress Agentic RAG" footer credit. |
| `BRAND_FOOTER_TEXT` | `Synthetic demo data - no real customer or call information.` | The left-hand footer line. Empty removes it. |
| `BRAND_DOCS_URL` | `/api/v1/docs` | Where the header "API" link points — send it to your own developer portal if you have one. |
| `BRAND_SUPPORT_URL` | *(empty)* | Adds a "Support" link to the footer. Empty hides it. |

All of them are optional. With none set, the product looks exactly as it does in the reference
deployment.

## A worked example at deploy time

```bash
fly secrets set \
  BRAND_PRODUCT_NAME="Northwind Call IQ" \
  BRAND_TAGLINE="Conversation intelligence for insurers" \
  BRAND_PRIMARY_COLOR="#7c3aed" \
  BRAND_ACCENT_COLOR="#0ea5e9" \
  BRAND_POWERED_BY=0 \
  BRAND_FOOTER_TEXT="© Northwind Analytics. All rights reserved." \
  BRAND_SUPPORT_URL="https://support.northwind.example"
```

Locally, put the same keys in `.env` and run `make dev`. This sets the deployment's *defaults* —
what it boots with, and what a reset returns to. A partner who wants to keep tuning their identity
afterwards does it in Settings → Branding rather than by redeploying.

## Checking it

```bash
curl -s http://localhost:3000/api/v1/branding | jq
```

```json
{
  "productName": "Northwind Call IQ",
  "tagline": "Conversation intelligence for insurers",
  "logoUrl": "",
  "primaryColor": "#7c3aed",
  "accentColor": "#0ea5e9",
  "poweredBy": false,
  "footerText": "© Northwind Analytics. All rights reserved.",
  "docsUrl": "/api/v1/docs",
  "supportUrl": "https://support.northwind.example"
}
```

`GET /api/v1/branding` is public and carries no secrets: a partner front-end built against this API
can theme itself from the same source the bundled UI uses. **Settings → Branding** shows the same
identity with a live preview and the editable form; `/admin/branding` shows it read-only in the
operator console, which is the quickest way to confirm what a deployment will show before anyone
opens it.

## Supplying a logo

Three options. The first is the one a partner should reach for.

1. **Upload it in the product** — Settings → Branding, or:

   ```bash
   curl -s -X POST "$BASE/api/v1/settings/logo" \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -F "logo=@./logo.svg;type=image/svg+xml" | jq '.branding.logoUrl'
   ```

   The file is written to `DATA_DIR/branding/logo.<ext>` and `branding.logoUrl` is pointed at it
   with a cache-busting query, so a re-upload is visible immediately rather than after a browser
   cache clear. Accepted types are `image/svg+xml`, `image/png`, `image/jpeg` and `image/webp`;
   the cap is 512 KB. Uploading one extension removes the others, so there is never an
   accumulating pile of orphaned marks. `DELETE /api/v1/settings/logo` removes the file and clears
   `logoUrl`.

   The image is stored as a file rather than in the settings document on purpose: a base64 image
   in a settings row would be re-read on every read of every unrelated setting.
2. **Host it yourself** — `BRAND_LOGO_URL=https://cdn.example.com/logo.svg`, or the same value set
   through `PUT /api/v1/settings/branding`. Any absolute `https` URL works.
3. **Mount it on the data volume by hand** — drop the file in `DATA_DIR/branding/` and set
   `BRAND_LOGO_URL=/branding/logo.svg`. On Fly, `DATA_DIR` is the `data` volume, so the logo
   survives deploys and needs no image rebuild:

   ```bash
   fly ssh sftp shell
   put ./logo.svg /data/branding/logo.svg
   ```

The `/branding/*` route serves image types only (`svg`, `png`, `jpg`, `webp`, `gif`, `ico`), refuses
any path that resolves outside the branding directory, and sets `nosniff` plus a restrictive
`Content-Security-Policy` on the response — an uploaded SVG is a document that can carry script,
and the sandboxed policy is what stops it running with this origin's privileges.

Size the logo for a 24-pixel-high slot; SVG is strongly preferred.

## How the colours are applied

`app/globals.css` maps every Tailwind theme token to a shared UI-kit token
(`--color-brand-600: var(--arag-brand-600)`, and so on). The layout emits a small `<style>` block
after the stylesheet that overrides just those UI-kit tokens, so a single variable re-colours the
Tailwind utilities used by the demo **and** the `.arag-*` components used by the admin console
together.

Colour values are validated before they are emitted (`safeColor` in `lib/branding.ts`): hex and
`rgb()`/`hsl()` notations are accepted, and anything else falls back to the default. A value that
could close the declaration and inject a rule is refused rather than rendered. `BRAND_LOGO_URL` and
`BRAND_SUPPORT_URL` are checked the same way — only `http(s)` or a same-origin path.

A colour or URL that arrives from the **settings form** goes through exactly the same grammar:
`validateBranding()` in `services/config.ts` calls `safeColor` and `safeLogoUrl` before anything is
persisted, and `applyToRuntime()` calls them again on the way into the runtime. A settings screen
is not a way past the checks a value from the environment gets — an invalid colour is a 400, not a
rendered rule.

## What white-labelling does *not* change

- **The taxonomy and the agents.** Call reasons, outcomes, moments and the generated analysis are
  product behaviour, not branding — though they are no longer a fork either: labelsets and agents
  are editable in the product at `/taxonomy`. See
  [Extension points](extension-points.md#change-the-taxonomy) for the live route and
  [Build your own](build-your-own.md) for re-targeting the shipped seed.
- **The API shape.** `/api/v1` is identical in every deployment, so an integration written against
  one partner's instance works against another's.
- **Attribution in the source.** Hiding the powered-by credit is a presentation choice; the
  Apache-2.0 `LICENSE` and `NOTICE` obligations still apply to redistribution.

## Verification

`make check` runs unit tests for the parser (including the injection cases) and integration tests
that boot a second, white-labelled server and assert both `GET /api/v1/branding` and the rendered
HTML. `make e2e` runs `test/e2e/branding.spec.ts`, which starts a partner-configured server and
checks the rendered name, tagline, footer, support link, computed `--color-brand-600` and the
absence of the Progress credit — including in the operator console.

Against a real Knowledge Box, `make smoke-write` additionally proves that a settings write
persists *and* that a second reader sees the effect, which is the part a write-only assertion
would miss.
