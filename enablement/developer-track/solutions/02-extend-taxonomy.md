# Solution — Exercise 2: extend the taxonomy

## Option A — add a label to `disposition_flags`

In `lib/domain/taxonomy.ts`, inside `RESOURCE_LABELSETS`, find the `disposition_flags` entry and
add one more item to its `labels` array:

```ts
{
  id: "disposition_flags",
  title: "Disposition Flags",
  color: "#ea580c",
  multiple: true,
  kind: "RESOURCES",
  labels: [
    { label: "Complaint Raised", description: "A complaint or grievance was expressed during the call." },
    { label: "Cross-sell Offered", description: "The agent offered an additional product or plan." },
    { label: "Cross-sell Accepted", description: "The member agreed to an additional product or plan." },
    { label: "Retention Save", description: "A member who wanted to cancel was retained." },
    { label: "Compliance Risk", description: "Possible compliance issue: missing disclosure, PHI mishandling, unverified identity." },
    { label: "Coverage Denied", description: "A claim, service, or authorization was denied." },
    { label: "First-Call Resolution", description: "Issue resolved on the first contact with no follow-up." },
    { label: "Vulnerable Member", description: "Member appears elderly, distressed, or in a sensitive health situation." },
    // added:
    { label: "Language Barrier", description: "The call involved a language barrier or required an interpreter." },
  ],
},
```

That's the entire code change. `labelOps(RESOURCE_LABELSETS)` (also in `lib/domain/taxonomy.ts`)
automatically includes the new label in the `resource-labeler` agent's `label` operation the next
time it's built — nothing else references the array by length or by a hardcoded label list.

## Option B — a new labelset

Add a new entry to `RESOURCE_LABELSETS` (same array), following the `line_of_business` shape:

```ts
{
  id: "channel_preference",
  title: "Preferred Channel",
  color: "#0d9488",
  multiple: false,
  kind: "RESOURCES",
  labels: [
    { label: "Phone", description: "Member prefers to be contacted by phone." },
    { label: "Email", description: "Member prefers email." },
    { label: "Portal", description: "Member prefers the self-service portal/app." },
  ],
},
```

## Re-provision

```bash
curl -s -X POST http://localhost:3000/api/v1/admin/provision \
  -H "Authorization: Bearer dev-admin-token" -H "Content-Type: application/json" -d '{}'
```

This returns `202` with a `Job`. Poll it:

```bash
curl -s http://localhost:3000/api/v1/jobs/<jobId> -H "Authorization: Bearer dev-admin-token"
```

until `"status":"succeeded"`. Under the hood (`services/jobs.ts`, `JOB_PROVISION`):
`provisionLabelsets(rt)` (in `services/labelsets.ts`) calls `rt.arag.putLabelset()` once per
labelset in `ALL_LABELSETS` — including your new one — and then, unless you passed
`{"agents": false}`, `startAgent()` restarts `resource-labeler` so existing seeded calls are
re-classified with the label now available.

## Confirm

```bash
curl -s http://localhost:3000/api/v1/labelsets | python3 -m json.tool
```

For Option A, look inside the `disposition_flags` entry's `labels` array for `"Language Barrier"`.
For Option B, look for a new top-level entry with `"id": "channel_preference"`.

Then open http://localhost:3000/calls — the filter sidebar (built from this same
`GET /api/v1/labelsets` response by `components/CallsExplorer.tsx`) shows the new label or
labelset as a selectable chip. It will have a `0` count until at least one call is (re)classified
with it — either because you provisioned with agents on, or because you upload a new call whose
transcript matches the label's description.

## Why this works without touching ARAG-specific code

`services/labelsets.ts`'s `putLabelset()` and `provisionLabelsets()`, and
`lib/domain/taxonomy.ts`'s `labelOps()`, all iterate the taxonomy arrays generically — nothing in
the product hardcodes label names outside the taxonomy file itself (the one exception is
`lib/parse.ts`'s `VALID_METRIC_VALUES`, which validates the *generated metrics* enum fields, not
labelsets — a genuinely new metric enum value would need a matching update there too, but this
exercise only touched a labelset, which has no such allowlist).
