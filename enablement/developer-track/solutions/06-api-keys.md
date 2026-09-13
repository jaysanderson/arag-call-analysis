# Solution — Exercise 6: issue, use and revoke an API key

Every step below was executed verbatim against the sample deployment while this was written.

## The observed sequence

```
1. anon GET /api/v1/views                                     → 200
   GET /api/v1/settings → apiKeys {configured: 0, active: 0, managed: true}

2. POST /api/v1/api-keys {"name":"Lab exercise 06"}           → 201
   location: /api/v1/api-keys/886defcb-ce9a-44f5-8a5c-cdea7c244efe
   body: { "key": {...}, "secret": "ca_live_…" }   ← 40 chars, "ca_live_" + 32

3. anon GET /api/v1/views                                     → 401
   X-API-Key: <secret>                                        → 200
   Authorization: Bearer <secret>                             → 200

4. POST /api/v1/views  with X-API-Key                         → 201

5. GET /api/v1/api-keys →
     Lab exercise 06 | ca_live_ZG2nGwC2… | lastUsed 2026-09-13T09:28:05.629Z
     "secret" present anywhere in the response: False

6. DELETE /api/v1/api-keys/{id}                               → 200
   revoked key on /views                                      → 401
   anon on /views                                             → 401     ← still closed
   apiKeys {configured: 1, active: 0, managed: true}

7. DELETE /api/v1/api-keys/{id}?purge=true                    → 200
   anon GET /api/v1/views                                     → 200     ← reopened
```

Step 3 is the moment the deployment changes character, and step 6 is the one to dwell on: the key
is dead, and the API is *still* closed. Only step 7 reopens it.

## Answers

**1. SHA-256 rather than a password KDF**

The case for it: a generated key is `randomBytes(24)` — **192 bits** — base64url-encoded behind a
`ca_live_` prefix. There is no dictionary, no pattern and no human memory in it, so there is
nothing for an offline attacker to brute-force: a leaked `apikeys.json` full of SHA-256 digests
grants exactly nothing regardless of how fast the attacker can hash. Meanwhile a deliberately slow
KDF would be run on **every authenticated request**, against **every active key** (see answer 2),
adding latency to the hot path in exchange for resistance to an attack that cannot succeed anyway.

What would make it the wrong choice: any reduction in entropy or any human involvement in choosing
the key. If keys became shorter, or structured, or operator-chosen — which is exactly what
`API_KEYS` seeds are — then the digest becomes brute-forceable and a KDF becomes correct. The
product half-acknowledges this already: `previewOf()` shows the first eight characters of the
**secret** for keys it generated, but the first eight of the **digest** for keys seeded from
`API_KEYS`, because it cannot assume an operator-chosen value is strong enough to show a fragment
of.

**2. Why `verifyApiKey()` does not stop at the first match**

It hashes the presented key once, then walks every active key comparing with `constantTimeEqual`,
**without breaking out when one matches**. Constant-time comparison alone stops an attacker
learning how many leading bytes of a digest they guessed right. Continuing past the match closes
two further channels: the response time no longer varies with the presented key's **position** in
the store (so you cannot learn "my key is the first one issued" or probe for where a target key
sits), and it no longer varies with whether a match happened **at all** relative to store size — so
the total time reveals neither which key matched nor how many keys exist. The cost is that every
authenticated request does O(active keys) hash comparisons, which is why answer 1's "a slow hash
would be run against every active key" matters.

**3. The boundary, in one sentence**

*An API key authorises a caller to read and contribute call data — list and fetch calls, upload,
delete, ask, share, and save views — but never to change the deployment itself: it cannot alter
settings, rotate the Knowledge Box credential, issue or revoke keys, or run a retention purge, all
of which require the operator token.*

**4. If `API_KEYS` seeding were idempotent by name**

`seedApiKeys()` imports each comma-separated value as `"Environment key N"`, skipping any whose
**digest** already exists. Keyed on the name instead, this sequence goes wrong:

1. `API_KEYS=abc` seeds `Environment key 1`.
2. The key leaks; an operator revokes it. The row stays, marked revoked — correct.
3. Someone removes `abc` from the environment and later re-adds it (a rollback, a restored
   `.env`, a copy-pasted Fly secret).
4. Seeding sees a row named `Environment key 1` already exists... and depending on which way the
   check falls, either silently ignores the (still live, still leaked) credential, or — the
   dangerous branch — writes a fresh active row for it.

Digest-keyed seeding makes step 4 unambiguous: this exact secret is already known to the store, in
whatever state the operator left it. **A revoked key can never be resurrected by a restart.** That
is the same incident-response reasoning as D-CA-46, one layer down.

**5. Footgun or safety property?**

Both, and which one it is depends entirely on whether it is written down.

It is a **safety property** for the case it was built for: revoking a compromised key is the action
you take under pressure, and it must never be the action that opens the API to the world. The old
behaviour did exactly that, silently, with no way back — it is a far worse failure than the one
this trades against.

It is a **footgun** for the public-demo case: an operator experiments with a key on a deployment
whose entire value is that anyone can browse it, revokes it to tidy up, and the demo is now
`401`-ing strangers. Nothing in the revoke confirmation says so.

For the runbook, three lines:

- *Issuing the first API key closes this deployment's read API to anonymous callers, permanently,
  including after every key is revoked.*
- *To reopen it you must purge the key rows: `DELETE /api/v1/api-keys/{id}?purge=true` for each
  one. Revoking is not enough, and this is deliberate.*
- *On a public demo deployment, do not issue keys. Use the operator token for anything that needs
  credentials.*

And the product-side improvement worth proposing: the create-key dialog should say, before the
first key is minted, that anonymous access is about to end.
