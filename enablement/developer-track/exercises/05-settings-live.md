# Exercise 5 — Change a setting live, and prove the effect through the API

**Time:** 20 minutes. **Difficulty:** core. **Needs:** the operator token (`dev-admin-token`).

## Why this exercise exists

`DECISIONS.md` **D-CA-34** is the decision this exercise makes concrete: *environment variables are
defaults, the settings store is the authority.* A value set in the product takes effect on the next
request — not the next restart, not the next deploy — because `applyToRuntime()` mutates the
memoised runtime container in place rather than asking every call site to consult an
`effectiveSettings()` object it might forget to consult.

Anyone can claim "no restart required". You are going to prove it: same process, same PID, one
request refused that the previous identical request accepted.

## The four sections

`PUT /api/v1/settings/{section}` accepts exactly four values for `{section}`, and nothing else:

| Section | Keys | What it is applied to |
|---|---|---|
| `branding` | `productName`, `tagline`, `footerText`, `poweredBy`, `primaryColor`, `accentColor`, `logoUrl`, `docsUrl`, `supportUrl` | `rt.branding` |
| `connection` | `kbId`, `region`, `baseUrl`, `generativeModel`, `reranker`, `timeoutMs`, `apiKey` (write-only) | `rt.env.arag`, and a wholesale replacement of `rt.arag` |
| `limits` | `maxQuestionChars`, `maxUploadBytes`, `rateLimitRps`, `rateLimitBurst`, `cacheTtlMs` | `rt.env`, and a replacement of `rt.cache` when the TTL moves |
| `retention` | `days`, `enabled` | read by `services/retention.ts` on demand |

`limits` is the one to use here, because its effect is a clean, observable HTTP status change.

> **Connection is frozen in sample mode.** `applyToRuntime()` returns early when
> `rt.env.arag.mock` is true — re-pointing the in-process sample Knowledge Box would strand the
> sample data irrecoverably. The write is still stored; it just is not applied. The Settings screen
> says so rather than pretending.

## Task

Lower `limits.maxQuestionChars` from 500 to 60, show that the same "ask this call" request that
succeeded now fails with a `400` naming the new bound, then reset the section and show it succeeds
again — all without restarting the server.

## Steps

```bash
B=http://localhost:3000
T=dev-admin-token
ID=$(curl -s "$B/api/v1/calls?page_size=1" | python3 -c 'import json,sys;print(json.load(sys.stdin)["items"][0]["id"])')
Q='Why did the member call and what did the agent promise to do next, in detail, covering every commitment made?'
echo "${#Q} characters"      # 110 — comfortably over 60, comfortably under 500
```

**1. Ask, at the shipped limit.** Expect `200`:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$B/api/v1/calls/$ID/ask" \
  -H 'Content-Type: application/json' -d "$(python3 -c "import json;print(json.dumps({'question':'''$Q'''}))")"
```

**2. Lower the limit.** The response is the whole `SettingsView`, not a fragment:

```bash
curl -s -X PUT "$B/api/v1/settings/limits" \
  -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
  -d '{"maxQuestionChars":60}' | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d["limits"]);print("overridden:",d.get("overridden"))'
```

**3. Confirm it from an unauthenticated read.** `GET /api/v1/settings` is open — this is the
deployment's own description of itself, and it is what the UI reads to decide which controls to
render:

```bash
curl -s "$B/api/v1/settings" \
  | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d["limits"]["maxQuestionChars"], d["overridden"])'
```

`overridden` should now contain `"limits"` — that is how the Settings screen knows to say
*"Overridden in the product"* instead of *"Currently from the environment"*.

**4. Ask exactly the same question again.** Same process, same call, same body:

```bash
curl -s -X POST "$B/api/v1/calls/$ID/ask" \
  -H 'Content-Type: application/json' -d "$(python3 -c "import json;print(json.dumps({'question':'''$Q'''}))")" \
  | python3 -m json.tool
```

Expect `400` and an RFC 9457 problem document whose `detail` is
`"question must be at most 60 characters"` — the *new* number, produced by the value you just
wrote, with no restart in between.

**5. Check the audit trail.** Every settings write is recorded:

```bash
curl -s "$B/api/v1/admin/audit?action=settings.limits&limit=5" -H "Authorization: Bearer $T" \
  | python3 -c 'import json,sys;[print(a["createdAt"], a["actor"], a["action"], a["detail"]) for a in json.load(sys.stdin)["items"]]'
```

You should see `settings.limits` by `operator`, with `detail` naming the key that changed and its
new value.

**6. Reset the section.**

```bash
curl -s -X DELETE "$B/api/v1/settings/limits" -H "Authorization: Bearer $T" \
  | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d["limits"]["maxQuestionChars"], d["overridden"])'
```

Back to `500`, and `overridden` is empty again. Re-run step 1 — it is a `200` once more. Then check
the trail for `settings.limits.reset`; a reset is an audited event in its own right, not the
absence of one.

**7. Prove the authorisation boundary.** Settings are operator-only; an API key is not enough.
Issue a key (Exercise 6 covers the store properly) and try both a settings write and a saved-view
write with it:

```bash
K=$(curl -s -X POST "$B/api/v1/api-keys" -H "Authorization: Bearer $T" \
      -H 'Content-Type: application/json' -d '{"name":"ex05 check"}' \
    | python3 -c 'import json,sys;print(json.load(sys.stdin)["secret"])')

curl -s -o /dev/null -w "settings: %{http_code}\n" -X PUT "$B/api/v1/settings/limits" \
  -H "X-API-Key: $K" -H 'Content-Type: application/json' -d '{"maxQuestionChars":400}'
curl -s -o /dev/null -w "views:    %{http_code}\n" -X POST "$B/api/v1/views" \
  -H "X-API-Key: $K" -H 'Content-Type: application/json' -d '{"name":"k","query":"lifecycle=analysed"}'
```

`401 Admin token required` for the setting, `201` for the view. That is **D-CA-42** in one pair of
requests: a key is a credential for *using* the data, never for re-pointing the deployment. Clean
up before you go on — a surviving key closes the API for the rest of the lab (Exercise 6 explains
why):

```bash
KID=$(curl -s "$B/api/v1/api-keys" -H "Authorization: Bearer $T" \
      | python3 -c 'import json,sys;print(json.load(sys.stdin)["items"][0]["id"])')
curl -s -o /dev/null -X DELETE "$B/api/v1/api-keys/$KID?purge=true" -H "Authorization: Bearer $T"
```

**8. See the same thing in the UI.** <http://localhost:3000/settings?tab=limits>, signed in as an
operator via <http://localhost:3000/admin/login>. The panel has an **In force now** card that reads
the same `GET /api/v1/settings` you just curled, and a **Reset** button that issues the same
`DELETE`. `/settings?tab=about` shows the audit trail.

## Acceptance criteria

- The *identical* ask request returns `200`, then `400`, then `200` again, with no restart —
  and you can show the server's start time is unchanged (`GET /api/v1/admin/health`'s `uptimeSec`
  only ever goes up).
- `GET /api/v1/settings` reports `overridden: ["limits"]` while the override is in force and
  `overridden: []` after the reset.
- `GET /api/v1/admin/audit` holds both a `settings.limits` and a `settings.limits.reset` entry.
- The same `PUT` presented with an API key instead of the operator token returns
  `401 Admin token required`, while `POST /api/v1/views` with that key returns `201`.

## Questions to answer

1. `PUT /api/v1/settings/{section}` is `auth: "admin"`, not `auth: "write"` — an API key will not
   do. Why is that the right line to draw? (D-CA-42: a key is a credential for *using* the data,
   not for re-pointing the deployment at a different Knowledge Box.)
2. Change `limits.cacheTtlMs` instead and look at `GET /api/v1/admin/cache` before and after. Every
   entry is gone. Why can a TTL change not preserve the existing entries?
   (`TtlCache.ttlMs` is `readonly`: an entry's expiry is fixed when it is written, so a new policy
   means a new cache.)
3. `connection.apiKey` can be written but never read back, and appears in the audit `detail` as
   `true` rather than as its value. Name both problems that design avoids. (D-CA-35: a second leak
   surface, and a form that posts back rendered content clearing the service-account token the
   moment an operator saves an unrelated field.)
4. `DELETE /api/v1/settings/limits` restores 500. Where did the 500 come from, given that the
   environment variable was read once at boot and the runtime has been mutated since?
   (`rt.envDefaults`, snapshotted in `buildRuntime()` precisely so that reset is a real operation.)
5. Try `PUT /api/v1/settings/limits` three ways — `{"maxQuestionChars": 5}`, `{"nonsense": 1}`
   and `{}`. All three are refused, by three different layers. Name each one.
   (Schema range: `/maxQuestionChars must be >= 40`. Schema `additionalProperties: false`:
   `/nonsense is not an allowed property`. And the service itself:
   `No recognised settings in the request body` — a `400` from `services/config.ts`, after
   validation passed, because an empty patch is a no-op an operator should be told about rather
   than a success they can misread.)
