# White-labelling

A partner can ship this product under their own identity **by configuration alone** — no fork, no
rebuild, no code change. Every user-visible identity element is read from the environment at boot
and served from one public endpoint.

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

## A worked example

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

Locally, put the same keys in `.env` and run `make dev`.

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
can theme itself from the same source the bundled UI uses. The admin console also shows the
effective branding under **Config → Branding (white label)**, which is the quickest way to confirm
what a deployment will show before anyone opens it.

## Supplying a logo

Two options:

1. **Host it yourself** — `BRAND_LOGO_URL=https://cdn.example.com/logo.svg`. Any absolute
   `http(s)` URL works.
2. **Mount it on the data volume** — drop the file in `DATA_DIR/branding/` and set
   `BRAND_LOGO_URL=/branding/logo.svg`. On Fly, `DATA_DIR` is the `data` volume, so the logo
   survives deploys and needs no image rebuild:

   ```bash
   fly ssh sftp shell
   put ./logo.svg /data/branding/logo.svg
   ```

The `/branding/*` route serves image types only (`svg`, `png`, `jpg`, `webp`, `gif`, `ico`), refuses
any path that resolves outside the branding directory, and sets `nosniff` plus a restrictive
`Content-Security-Policy` on the response — an uploaded SVG cannot run script.

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

## What white-labelling does *not* change

- **The taxonomy and the agents.** Call reasons, outcomes, moments and the generated analysis are
  product behaviour, not branding. To change those, see
  [Build your own](build-your-own.md).
- **The API shape.** `/api/v1` is identical in every deployment, so an integration written against
  one partner's instance works against another's.
- **Attribution in the source.** Hiding the powered-by credit is a presentation choice; the
  Apache-2.0 `LICENSE` and `NOTICE` obligations still apply to redistribution.

## Verification

`make check` runs unit tests for the parser (including the injection cases) and integration tests
that boot a second, white-labelled server and assert both `GET /api/v1/branding` and the rendered
HTML. `make e2e` runs `test/e2e/branding.spec.ts`, which starts a partner-configured server and
checks the rendered name, tagline, footer, support link, computed `--color-brand-600` and the
absence of the Progress credit — including in the admin console.
