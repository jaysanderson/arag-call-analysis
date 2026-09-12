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
`[env]`) holding only job records — call data itself lives entirely in ARAG, not on this volume.
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

- **Persistent volume for `DATA_DIR`.** Without one, job history resets on every restart — calls
  and their ARAG-derived data are unaffected (they live in ARAG), but `/admin/jobs` loses its
  history and a job that was `running` at restart time is simply gone. Acceptable for a stateless
  container platform; not acceptable if operators rely on job history for troubleshooting.
- **Health check wiring.** The Dockerfile's own `HEALTHCHECK` hits `GET /healthz`; most platforms
  want the same URL wired into their own liveness/readiness probes (`/healthz` for liveness,
  `/readyz` for readiness — the latter calls ARAG and returns 503 if unreachable).
- **`TRUST_PROXY`.** Set to whichever value matches the platform's edge: `fly` only makes sense
  behind Fly's own proxy (trusts `Fly-Client-IP`); anywhere else needs `xff` (trusting the first
  `X-Forwarded-For` hop from a proxy you control) or `none` (every caller shares one rate-limit
  bucket — safe but coarse). Getting this wrong either lets clients spoof their rate-limit
  identity or collapses everyone into one bucket unintentionally.
- **Single-instance assumption.** As with Fly, running more than one container instance behind a
  load balancer means each instance has its own cache and rate limiter — see
  [Scaling](scaling.md).

## What changes for each

| | Local mock | Single Fly machine | Container anywhere |
|---|---|---|---|
| ARAG | in-process mock, no egress | live KB, co-located region | live KB, region depends on platform |
| Credentials | none | Fly secrets | platform secret store |
| `DATA_DIR` | `./data` (gitignored) | Fly volume `/data` | needs a mounted volume or job history is ephemeral |
| Cache / rate limiter | single process, resets on restart | single process, persists across requests while the machine is warm | single process per container instance |
| Scaling | n/a | manual (this deployment runs one machine) | horizontal scaling requires the changes in [Scaling](scaling.md) |
| TLS | none (localhost) | `force_https` at Fly's edge | platform-dependent; terminate TLS in front of the container |
