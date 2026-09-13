# Exercise 6 — Issue, use and revoke an API key

**Time:** 20 minutes. **Difficulty:** core. **Needs:** the operator token (`dev-admin-token`).

## Why this exercise exists

`API_KEYS` used to be the mechanism: a comma-separated environment variable, so rotating a key
meant a redeploy and "which key did this?" had no answer at all. `DECISIONS.md` **D-CA-36** replaced
it with a real store — keys are minted in the product, stored as SHA-256 digests, attributed in the
audit trail, and revocable without touching the deployment. `API_KEYS` survives only as a one-time
seed so a fresh deployment is never locked out of its own API.

There is one behaviour here that surprises people, and it is deliberate. Read the warning before
you run anything.

> ### Read this first: key enforcement is sticky
>
> Before any key exists, routes marked `auth: "api"` are **open** — that is what makes the sample
> deployment browsable with no credentials. The moment this deployment has *ever* had a key, those
> routes require one, and **revoking the last key does not reopen them**. Reopening takes a
> separate, deliberate act: deleting the key rows with `?purge=true`.
>
> That is `apiKeysEnforced()` asking *"has this deployment ever had a key"* rather than *"does it
> have an active one"* — **D-CA-46**, found in review. The old behaviour meant that revoking a
> compromised key (the exact incident-response action) turned the API *open*, with no way back,
> because the `API_KEYS` seed is idempotent by digest and a restart resurrected the same revoked
> row.
>
> **So: finish the exercise, including the purge at the end**, or the rest of the lab starts
> returning `401` from endpoints that worked ten minutes ago.

## The three auth modes you will cross

| Mode | Example route | Behaviour |
|---|---|---|
| `none` | `GET /api/v1/calls` | public, always — unaffected by anything in this exercise |
| `api` | `GET /api/v1/views`, `POST /api/v1/calls/{id}/shares` | open until a key exists, then needs one |
| `admin` | `PUT /api/v1/settings/{section}`, `/api/v1/api-keys` | always the operator token; a key never suffices |

## Steps

```bash
B=http://localhost:3000
T=dev-admin-token
```

**1. Establish the "before".** With no key issued, an `api` route answers anonymously:

```bash
curl -s -o /dev/null -w "anon GET /views -> %{http_code}\n" "$B/api/v1/views"
curl -s "$B/api/v1/settings" | python3 -c 'import json,sys;print(json.load(sys.stdin)["apiKeys"])'
```

Expect `200`, and `{"configured": 0, "active": 0, "managed": true}`.

**2. Issue a key.** The name is required and is what the audit trail will show:

```bash
curl -s -X POST "$B/api/v1/api-keys" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d '{"name":"Lab exercise 06"}' | python3 -m json.tool
```

`201`, with `Location: /api/v1/api-keys/{id}` and a body of `{ "key": {...}, "secret": "ca_live_…" }`.

**That `secret` is the only time the key material will ever exist outside the caller's hands.** The
store keeps a SHA-256 digest and nothing else, so there is no endpoint, no screen and no log line
that can produce it again. Capture it now:

```bash
curl -s -X POST "$B/api/v1/api-keys" -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d '{"name":"Lab exercise 06"}' > /tmp/key.json
K=$(python3 -c 'import json;print(json.load(open("/tmp/key.json"))["secret"])')
KID=$(python3 -c 'import json;print(json.load(open("/tmp/key.json"))["key"]["id"])')
```

(If you ran the first `POST` too, you now have two keys. Harmless — the purge in step 7 takes both.)

**3. Watch the API close behind you.** Same request as step 1:

```bash
curl -s -o /dev/null -w "anon        -> %{http_code}\n" "$B/api/v1/views"
curl -s -o /dev/null -w "X-API-Key   -> %{http_code}\n" "$B/api/v1/views" -H "X-API-Key: $K"
curl -s -o /dev/null -w "Bearer      -> %{http_code}\n" "$B/api/v1/views" -H "Authorization: Bearer $K"
```

`401`, then `200`, then `200`. Both header forms are accepted — `authenticate()` in `lib/api.ts`
tries the bearer value and the `X-API-Key` value against the store in turn.

**4. Use it for something that matters.** Create a shared saved view as the key:

```bash
curl -s -X POST "$B/api/v1/views" -H "X-API-Key: $K" -H 'Content-Type: application/json' \
  -d '{"name":"Lab 06 escalations","query":"label=call_outcome%2FEscalated&sort=created&order=desc","description":"Created with an API key"}' \
  | python3 -m json.tool
```

**5. Look at what the store will and will not tell you.**

```bash
curl -s "$B/api/v1/api-keys" -H "Authorization: Bearer $T" | python3 -m json.tool
```

Three things to notice:

- `preview` is `ca_live_` plus eight characters — and for a key the product generated, those eight
  characters come from the **secret**, while for a key seeded from `API_KEYS` they come from its
  **digest**. Eight of 192 random bits reveal nothing; eight characters of an operator-chosen
  environment value might.
- `lastUsedISO` moved when you used it in steps 3 and 4. It is written at most once a minute per
  key, so an authenticated read is not also a guaranteed disk write.
- There is no `secret` field anywhere in the response. Grep for it if you like.

**6. Revoke it, and see what revoking does and does not do.**

```bash
curl -s -o /dev/null -w "revoke -> %{http_code}\n" -X DELETE "$B/api/v1/api-keys/$KID" -H "Authorization: Bearer $T"

curl -s -o /dev/null -w "revoked key -> %{http_code}\n" "$B/api/v1/views" -H "X-API-Key: $K"
curl -s -o /dev/null -w "anon        -> %{http_code}\n" "$B/api/v1/views"
curl -s "$B/api/v1/settings" -H "Authorization: Bearer $T" | python3 -c 'import json,sys;print(json.load(sys.stdin)["apiKeys"])'
```

The revoked key is `401` immediately. Anonymous access is **still** `401`. And `apiKeys` reads
`{"configured": 1, "active": 0}` — the row is still there, which is the point: "what did this key
touch, and when" is what an incident review needs, so revocation never deletes.

**7. Purge, and reopen the deployment.** This is the clean-up you must not skip:

```bash
for id in $(curl -s "$B/api/v1/api-keys" -H "Authorization: Bearer $T" \
            | python3 -c 'import json,sys;[print(k["id"]) for k in json.load(sys.stdin)["items"]]'); do
  curl -s -o /dev/null -X DELETE "$B/api/v1/api-keys/$id?purge=true" -H "Authorization: Bearer $T"
done
curl -s -o /dev/null -w "anon GET /views -> %{http_code}\n" "$B/api/v1/views"
```

Back to `200`.

**8. The same flow in the UI.** Sign in at <http://localhost:3000/admin/login>, then
<http://localhost:3000/settings?tab=api-keys>. Creating a key shows the secret once behind a
*"this is the only time this key will ever be shown"* notice with a copy button; dismissing it or
reloading the page loses it for good. Revoking is behind a confirmation that states the
consequence — *"starts receiving 401 immediately"* — rather than asking "are you sure?".

## Acceptance criteria

- You can show `GET /api/v1/views` returning `200` → `401` → `200` (with the key) → `401` (after
  revocation) → `200` (after the purge).
- The created key's `secret` appears exactly once, in the `201` body, and in no later response.
- `GET /api/v1/admin/audit` contains `apikey.create` by `operator`.
- Every key row is purged when you finish, and an anonymous `GET /api/v1/views` is `200` again.

## Questions to answer

1. The store uses SHA-256, not bcrypt/argon2/scrypt. Argue the case *for* that choice, then say
   what would have to change about key generation to make it the wrong one.
   (192 bits of `randomBytes` leaves nothing to brute-force offline; a slow hash would only add
   latency to every authenticated request. A short or operator-chosen key changes that answer.)
2. `verifyApiKey()` compares the presented digest against **every** active key with
   `constantTimeEqual`, and keeps going after it finds a match. What does not stopping early buy?
3. A key can create a saved view and a share link, but not change a setting or mint another key.
   Write that boundary out in one sentence, in words a customer's security reviewer would accept.
4. `API_KEYS` seeding is idempotent *by digest*. What would break if it were idempotent by name
   instead? (Remove the variable, restart, re-add it — a revoked key would come back active.)
5. You issued a key and the deployment's read API closed. For a customer running a public demo,
   is that a footgun or a safety property? What would you put in the runbook either way?
