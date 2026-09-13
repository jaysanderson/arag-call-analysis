# When to use

## Good fit

- **You have recorded calls (or transcripts) and cannot review them all.** The whole point is to
  give every call the structured treatment a QA analyst would only have time to give a sample of.
- **You need to find calls by what happened in them, not just by metadata.** "Every complaint
  about a denied prior authorization this month" or "every call where a cross-sell was accepted"
  is a filter here, not a manual search project.
- **You want a defensible, cited answer to a specific question about one call**, fast — "did the
  agent disclose X," "was the member's issue resolved" — with a way to jump straight to the
  moment in the recording that supports the answer, rather than trusting an unsourced summary.
- **Your call taxonomy is not ours.** The shipped health-insurance vocabulary is a default, not a
  constraint: labelsets, their labels and the instructions the agents read are created and edited
  in the product, so a utility, telecoms or IT-support contact centre adapts it without a fork or
  an engineer.
- **A partner needs to ship it under their own identity.** Name, logo, colours, footer and credits
  are edited in the product and take effect immediately — see
  [White-labelling](../developer/white-label.md).
- **Your organization already uses (or is willing to run) Progress Agentic RAG.** This product is
  a purpose-built application layer on ARAG, not a standalone analytics engine — see
  [Overview](overview.md#how-its-built).
- **A single-tenant deployment per team/organization is acceptable.** The MVP has no per-user
  authentication or per-call authorization (see
  [Security model](../architecture/security-model.md#known-mvp-limitations)) — everyone who can
  reach the deployment (and hold the right API key, if configured) can see every call in it.
  Configuration changes are a separate matter: those are operator-only, behind the admin sign-in,
  and audited.

## Poor fit

- **Real-time, in-call guidance.** This product analyzes calls *after* they are recorded and
  transcribed; it does not listen live or coach an agent during a call.
- **Multi-tenant SaaS with strict per-customer data isolation**, without adding an
  identity-aware layer in front — the MVP's authorization model is intentionally simple (admin
  token + optional API keys, no per-user or per-call scoping).
- **Extremely high call volumes without further engineering.** The current design walks a
  Knowledge Box catalog up to 500 resources and holds its read cache and rate limiter in one
  process; see [Scaling](../architecture/scaling.md) for what changes at 10x/100x before it fits
  a very large deployment.
- **A horizontally scaled, multi-machine deployment, as it stands.** Each machine keeps its own
  settings, API keys, taxonomy edits, saved views and audit trail in its own `DATA_DIR`, so a
  change made on one machine does not reach the others unless that volume is shared — and even
  then it is applied in memory, so the other machines pick it up only on restart. This is a real
  operational constraint, not a performance note; see
  [Scaling](../architecture/scaling.md#the-multi-machine-constraint-that-is-not-about-caching).
- **Unattended, automatic deletion of old recordings.** Retention is a recorded policy with a
  preview, and a purge that runs only when a person or a scheduler asks for it. There is no
  background sweeper, deliberately. If your requirement is "this must happen without anyone doing
  anything", point a scheduler at the purge endpoint.
- **Regulatory environments requiring on-premises-only processing of every artifact**, unless your
  ARAG deployment itself satisfies that requirement — this product's own infrastructure footprint
  is minimal (Next.js + a small job store), but it is a thin layer over ARAG, and ARAG's own
  deployment model governs where recordings and transcripts actually live.
- **A need for the underlying model's raw confidence numbers or full explainability.** Confidence
  is intentionally shown only as a qualitative badge (High/Moderate/Low/No grounded citations),
  not a raw score — see the [FAQ](faq.md).

## Alternatives

- **Manual QA sampling** (a supervisor listens to a fixed percentage of calls) — cheaper to set up,
  far less coverage, and does not scale with call volume.
- **A dedicated contact-centre analytics platform** (purpose-built, often with deeper CCaaS
  integration, real-time features, and multi-tenant controls out of the box) — a better fit for an
  organization that needs those specific capabilities today rather than a fast, ARAG-native build.
- **A generic transcription-plus-keyword-search tool** — cheaper and simpler, but without the
  structured labels, generated scorecards, or grounded-with-citations chat this product adds on
  top of raw transcripts.
- **Build it yourself directly on ARAG** — this product's own architecture and its taxonomy
  pattern are a fully documented, working reference for exactly that; see
  [Extension points](../developer/extension-points.md) if that's the direction you want to take.
  Note that adapting the vocabulary is no longer a reason to fork: labelsets and agent
  instructions are edited in the product.
