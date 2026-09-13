# Deployment topologies

## Local mock

`make dev` with no `ARAG_API_KEY` set. A single process runs the Next.js dev server, an
in-process mock ARAG HTTP server on a random localhost port (`lib/mock.ts`), and everything else
(cache, job manager, `DATA_DIR` store) in the same process. No network egress at all. This is the
topology behind [Quickstart](../developer/quickstart.md)'s five-minute path and the one CI /
`make e2e` runs against (`ARAG_MOCK=1` in `playwright.config.ts`'s `webServer` command).

Good for: development, CI, demos with no credentials, and the showcase recording (`make
showcase`).

## Single Fly machine with a data volume

What's actually deployed, per `fly.toml`:

```toml
app = "call-analysis-arag"
primary_region = "iad"

[[mounts]]
  source = "data"
  destination = "/data"
  initial_size = "1gb"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 1
  [http_service.concurrency]
    type = "requests"
    soft_limit = 40
    hard_limit = 80

[[vm]]
  size = "shared-cpu-1x"
  memory = "1gb"
```

One `shared-cpu-1x` / 1 GB VM, one 1 GB persistent volume mounted at `/data` (`DATA_DIR=/data` in
`[env]`). Call data itself still lives entirely in ARAG and never on this volume — but the volume
is no longer only job history. It now holds this deployment's **configuration**: `settings.json`,
`apikeys.json`, `taxonomy.json`, `views.json`, `shares.json`, `audit.json` and any uploaded logo
under `branding/`. See [Backing up the volume](#backing-up-the-volume) below.

`min_machines_running = 1` keeps one machine always warm (so the in-process cache and rate
limiter, both memory-resident, survive between requests); `auto_stop_machines/auto_start_machines`
let Fly still scale to zero extra machines under load via its request-concurrency autoscaler, but
this deployment runs a **single** machine — there is no multi-machine ARAG deployment here (see
[Scaling](scaling.md) for what breaks if you add one without changing the code). Health checks
poll `GET /healthz` every 15 s; secrets (`ARAG_KB_ID`, `ARAG_API_KEY`, `ARAG_REGION`,
`ADMIN_TOKEN`) are set out-of-band with `fly secrets set`, never in `fly.toml`.

`region = "iad"` is chosen to co-locate with the ARAG zone `aws-us-east-2-1` — cross-region calls
to ARAG add latency to every request that isn't cache-hit, most visibly the `/ask` stream's
first-token time.

To validate the config without deploying: `make fly-validate` (`fly config validate -c
fly.toml`).

## Container anywhere

The `Dockerfile` is a three-stage build with no Fly-specific assumptions:

1. `oven/bun:1` — `bun install --frozen-lockfile`.
2. `oven/bun:1` — `bunx next build` with `ARAG_MOCK=1` forced during the build (the build only
   needs to render; it must never require live credentials to succeed).
3. `node:22-slim`, non-root user (`nextjs`, uid/gid 1001) — copies the Next.js **standalone**
   output and runs `node server.js`.

This image runs on any container platform (ECS, Cloud Run, plain Docker/Podman, Kubernetes) with
no code change. What changes per platform:

- **Persistent volume for `DATA_DIR`.** This is now a requirement rather than a nicety. Without
  one, every restart discards the deployment's settings, its issued API keys, its taxonomy edits,
  its saved views, its share links and its audit trail, along with the job history — the product
  falls back to whatever the environment supplies, and every key a partner was given stops
  authenticating. Calls and their ARAG-derived data are unaffected (they live in ARAG). Treat a
  missing volume the way you would treat a missing secret store.
- **Health check wiring.** The Dockerfile's own `HEALTHCHECK` hits `GET /healthz`; most platforms
  want the same URL wired into their own liveness/readiness probes (`/healthz` for liveness,
  `/readyz` for readiness — the latter calls ARAG and returns 503 if unreachable).
- **`TRUST_PROXY`.** Set to whichever value matches the platform's edge: `fly` only makes sense
  behind Fly's own proxy (trusts `Fly-Client-IP`); anywhere else needs `xff` (trusting the first
  `X-Forwarded-For` hop from a proxy you control) or `none` (every caller shares one rate-limit
  bucket — safe but coarse). Getting this wrong either lets clients spoof their rate-limit
  identity or collapses everyone into one bucket unintentionally.
- **Single-instance assumption.** As with Fly, running more than one container instance behind a
  load balancer means each instance has its own cache and rate limiter — and, unless they share
  one `DATA_DIR` volume, its own settings store, key store, taxonomy, saved views, share register
  and audit trail. A setting an operator changes on one instance changes that instance only. Even
  with a shared volume, the change is applied by mutating each process's in-memory runtime, so the
  instances that did not serve the write keep their old values until they restart. See
  [Scaling](scaling.md).

## What changes for each

| | Local mock | Single Fly machine | Container anywhere |
|---|---|---|---|
| ARAG | in-process mock, no egress | live KB, co-located region | live KB, region depends on platform |
| Credentials | none | Fly secrets | platform secret store |
| `DATA_DIR` | `./data` (gitignored) | Fly volume `/data`, backed up | a mounted volume is required: without it settings, API keys, taxonomy edits, views, shares and the audit trail are lost on restart |
| Cache / rate limiter | single process, resets on restart | single process, persists across requests while the machine is warm | single process per container instance |
| Scaling | n/a | manual (this deployment runs one machine) | horizontal scaling requires the changes in [Scaling](scaling.md) |
| TLS | none (localhost) | `force_https` at Fly's edge | platform-dependent; terminate TLS in front of the container |

## Backing up the volume

Because `DATA_DIR` now carries configuration, a backup policy is part of deploying this product
rather than an optional extra.

What is on it, and what losing it costs:

| File | Losing it means |
|---|---|
| `settings.json` | The deployment reverts to its environment defaults: partner branding, edited limits, a rotated service-account token and the retention policy are gone |
| `apikeys.json` | Every product-issued key stops authenticating and callers must be re-issued credentials. Keys seeded from `API_KEYS` come back on the next boot; keys issued in the product do not |
| `taxonomy.json` | The vocabulary reverts to the shipped seed. Labels already applied in the Knowledge Box survive, so the product and the Knowledge Box disagree until the taxonomy is re-created and re-provisioned |
| `views.json` | Saved views are gone. No call data is affected |
| `shares.json` | Every share link stops resolving — the record is the store, so an unrecoverable one means every issued URL 404s |
| `audit.json` | The record of who changed what is gone |
| `branding/` | An uploaded partner logo is gone, and `branding.logoUrl` points at a file that is no longer there |

The files are small JSON documents written atomically, so a filesystem copy is sufficient; there
is no database to quiesce.

```bash
fly ssh console -C "tar czf - -C /data ." > call-analysis-data-$(date +%F).tgz
```

Restoring is the same operation in reverse into `/data`, followed by a restart so the process
re-reads the store and re-applies the settings.

Treat the backup as secret-bearing. `settings.json` can contain a rotated ARAG service-account
token, and `apikeys.json` discloses key names and last-used times even though the key material is
only present as a SHA-256 digest. It needs whatever protection the deployment's credentials get —
see [Security model](security-model.md).

Do not reach for a shared volume as a way to share configuration between machines. It makes the
persistence consistent but not the behaviour: settings are applied by mutating each process's
in-memory runtime container, so a machine that did not handle the write serves the old values
until it restarts.