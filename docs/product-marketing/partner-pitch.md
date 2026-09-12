# Partner pitch — Call Analysis

For a Progress partner or systems integrator (SI) evaluating this as an engagement to bring to a
contact-centre client. See [`positioning.md`](positioning.md) for the full personas, use cases, and
name options referenced here (working name: **Call Analysis**; proposed customer-facing names live
there).

## The business case

Every contact centre records its calls; almost none of them are ever heard again. QA teams sample a
small fraction by hand, operations leaders build dashboards from whatever an agent bothered to
type into a CRM disposition field, and complaints, missed disclosures, and cross-sell
opportunities go unnoticed until they show up as a churn number or a regulatory finding. Call
Analysis closes that gap by running every recorded call through Progress Agentic RAG the moment it
lands: transcription, classification against a call taxonomy, structured analysis, and a
per-call grounded Q&A interface — all through a documented API, with a working demo that a
prospect can run themselves before committing to anything.

For a partner, the pitch to a client is straightforward: this is not a proof-of-concept that needs
six months of engineering before a client sees value. It is a working product — dashboard, call
list, per-call analysis, chat, admin panel — that can be evaluated in minutes against a mock
Knowledge Box, and pointed at a real one in the time it takes to provision an ARAG Knowledge Box
and set a handful of environment variables.

## Where a partner adds value

The product ships as an MVP aimed at a single deployment on a single Knowledge Box, seeded with a
generic health-insurance taxonomy and 24 synthetic demo calls. A partner's engagement is the work
between "runs a convincing demo" and "runs a specific client's contact centre":

- **Taxonomy adaptation.** The labelsets and the two generation prompts in
  `lib/domain/taxonomy.ts` are the entire domain model — call reason, outcome, sentiment, line of
  business, disposition flags, call moments, and the JSON shapes of the narrative analysis and
  metrics fields. Swapping health-insurance categories for a client's own call reasons, products, or
  compliance flags is a data change, not a rewrite.
- **Ingestion integration.** `POST /api/v1/calls` accepts a recording or transcript plus metadata
  and returns a job; a partner wires this to whatever the client already has — a call recorder's
  export, a CCaaS webhook, a batch export job — rather than building an ingestion pipeline from
  scratch.
- **Identity and authorization.** The MVP has no per-user authorization (documented in
  `SECURITY.md`): every caller who holds a valid API key can see every call. A real deployment
  needs the client's SSO or an identity-aware proxy in front of the service, and likely a
  per-team or per-queue authorization layer added to `lib/api.ts` — a well-scoped, billable piece
  of integration work.
- **Deployment and scaling.** The MVP is single-tenant, with a JSON file store (`DATA_DIR`) and a
  per-process cache and rate limiter. A partner engagement typically covers moving the data store
  to the client's database of choice, sizing the deployment (see
  [`../architecture/scaling.md`](../architecture/scaling.md) and
  [`../architecture/deployment-topologies.md`](../architecture/deployment-topologies.md)), and
  standing up monitoring around the admin panel's health and usage endpoints.
- **Branding and rollout.** Restyling the UI-kit tokens, running an enablement session for the
  client's QA and operations teams, and defining the rollout plan (pilot queue, then wider).

## What a partner can reuse as-is

- **The platform.** The vendored ARAG client, HTTP toolkit, OpenAPI helpers, and UI-kit tokens
  (`vendor/arag-platform/`) are shared across every product built on Progress Agentic RAG in this
  workspace; a partner already familiar with one ARAG-based product is familiar with the
  conventions of all of them.
- **The taxonomy pattern**, not just this taxonomy: `lib/domain/taxonomy.ts` is a template for how
  to express a labelset-plus-generation-agent domain model against ARAG's data-augmentation tasks —
  reusable structure even when every label changes.
- **The agents.** The two labeler agents and the one two-operation ask agent
  (`lib/domain/taxonomy.ts`'s `AGENTS`) are provisioned through the admin panel
  (`POST /api/v1/admin/provision`) and can be re-run against a new Knowledge Box without touching
  application code.
- **The API.** Every capability in the product — list, search, upload, delete, ask, dashboard,
  labelsets, jobs, admin — is a documented `/api/v1` route with an OpenAPI 3.1 contract; a partner
  can build an alternative front end, a batch export, or an integration against the same API the
  shipped UI uses, with no reverse engineering required.
- **The test suite and CI patterns** (unit, integration, and OpenAPI contract tests, an in-process
  mock ARAG server) as a template for testing further changes without needing a live Knowledge Box
  or spending LLM tokens on every test run.

## Implementation outline (rough phases)

1. **Discovery and taxonomy fit** — map the client's existing call-disposition categories,
   compliance requirements, and any product-specific cross-sell/upsell flows onto (or replacing)
   `lib/domain/taxonomy.ts`; confirm the compliance and QA team's must-see moments.
2. **Pilot deployment** — stand up a client Knowledge Box, provision the taxonomy and agents,
   connect a small ingestion feed (a single queue or a fixed historical batch), and validate the
   dashboard and chat against real calls with the QA team.
3. **Integration and hardening** — wire real ingestion (CCaaS export or recorder integration),
   add the client's authentication/authorization in front of `/api/v1`, move persistence off the
   JSON file store if the deployment needs it, and size the deployment for expected call volume.
4. **Rollout and enablement** — expand to the client's full call volume, train the operations and
   QA teams (the repo's `enablement/` tracks are a starting point), and hand over admin-panel
   operation (health checks, reprovisioning, log inspection) to the client's own operations team.
5. **Ongoing** — taxonomy refinement as call patterns shift, monitoring and cost tracking against
   ARAG usage, and periodic review of agent output quality (REMi scores, coverage of the
   `withMetrics` gap the dashboard already reports).

Actual phase length and sequencing depend on the client's existing telephony stack, call volume,
and compliance requirements — this outline is a shape for scoping, not a fixed statement of work.

## Commercial shape of an engagement

This document intentionally does not propose pricing — none is set for Call Analysis, and any
figure here would be invented. The commercially relevant facts a partner can use in scoping a
proposal:

- The product itself has **zero licensing cost beyond Progress Agentic RAG usage** — it is an
  open-source application (Apache-2.0) built entirely on ARAG; there is no separate software
  license fee to pass through.
- The variable cost a client will see is **ARAG/Nuclia usage**: transcription of uploaded
  recordings, the data-augmentation agent runs (two labelers plus one two-operation ask agent per
  call), and query-time `/ask` and `/predict/remi` calls proportional to how much staff actually
  use the chat feature. These are usage-based Progress/Nuclia costs, not something this repository
  prices.
- A partner's revenue is the **implementation engagement** described in the phases above:
  taxonomy adaptation, ingestion integration, authorization/deployment hardening, and enablement —
  work that is genuinely required for any client beyond the demo, and that does not exist yet for a
  given client until a partner does it.
