# Showcase script — Call Analysis (2:46)

Recorded by `showcase/record.spec.ts` (`SHOWCASE=1`) against the in-process mock ARAG
(`ARAG_MOCK=1`). The Knowledge Box in this environment seeds and provisions itself once per
process — see `lib/mock.ts` — so it already holds 13 of the product's 24 synthetic
health-insurance calls before the recording starts. Nothing here is real member, agent or call
data. Narration is written to be read aloud at a natural pace alongside the actions; timestamps
are approximate, taken from the recorded video
(`showcase/out/record-showcase-walkthrough/video.webm`, 2:46).

The recording is in two halves, because that is the shape of the product after the
full-implementation pass:

- **0:00–1:26, the analyst**, signed in as nobody. The dashboard and its date window, the
  drill-through, the facets, the column picker, search, the call workspace, and the four trust
  surfaces — a grounded answer, the citation scrub, the honest decline, the share link.
- **1:26–2:46, the operator**, signed in at `/admin/login`. The *same* Settings screen is shown
  read-only first, so the sign-in is the story — "this is the operator's view of the same product"
  — rather than an unexplained detour. The beat straight after it goes back to the calls list from
  the first half to save the view the visitor was not offered. It ends on the audit trail, which by
  then is a list of the changes the recording itself has just made.

Three deliberate departures from a from-empty demo:

1. Because the box is already seeded, `/welcome` genuinely offers "See the analysis" rather than
   "Try with sample calls". That is recorded honestly rather than reset and faked.
2. The dashboard window is a *custom* range read off the data (the day that comes nearest to
   halving the call list), not one of the named ranges. A named range is resolved against the
   clock, so "30 days" would mean something different every month and eventually nothing at all
   against a fixed sample; a window read off the data means the same thing whenever this is
   re-recorded.
3. Saving a view sits in the operator half rather than beside the facet filter where it reads more
   naturally, because a saved view is shared server-side state and the product does not offer a
   visitor a control whose click would be refused. That constraint turned out to be the better
   story: it is the shortest proof that signing in changes the same screen rather than opening a
   different application.

Everything the recording writes it also undoes: the saved view and the labelset are deleted, the
API key is revoked on camera, branding and retention go back to the environment default, the share
link is revoked, and the `call-insights` instructions are captured before the edit and written back
after. Two runs in succession record the same thing.

## The walkthrough

| Time | On-screen action | Narration | Endpoint behind it |
|---|---|---|---|
| 0:00–0:04 | Land on `/welcome`. Four onboarding steps, each already marked done. | "This is Call Analysis, built on Progress Agentic RAG. In this deployment the Knowledge Box is already connected, taxonomy provisioned and calls loaded — so the honest next step isn't to seed sample data, it's to see the analysis." | `GET /api/v1/onboarding` |
| 0:04–0:10 | Click "See the analysis". The dashboard loads: a six-tile stat strip, four charts, the by-agent and by-queue roll-ups. | "Every number here comes from one aggregation call over thirteen analysed calls. Nothing on this screen is hand-typed." | `GET /api/v1/dashboard` |
| 0:10–0:16 | Open the date picker and set a window part-way through the sample. The tiles, the charts and the sentiment mix all drop to the six calls inside it, and the strip says how many are outside. | "The window is a first-class filter, not a decoration. Narrow it and the whole page recomputes — and it tells you, plainly, that seven calls now sit outside what you are looking at." | `GET /api/v1/dashboard?from=…` |
| 0:16–0:22 | Click the "First-call resolution" tile. The calls list opens with two chips: the label, and the window. | "Every stat tile is a drill-through, and it carries the window with it. Eighty-three per cent of six analysed calls is five — and five is exactly what the list shows. The chart and the list cannot disagree." | `GET /api/v1/calls?label=disposition_flags/First-Call+Resolution&from=…` |
| 0:22–0:28 | A fresh `/calls` in Table mode. Open "Filter by Sentiment", tick Negative. | "The table is fully faceted, with live counts. Ticking Negative narrows the rows in place and leaves a removable chip behind — no page reload, no lost place." | `GET /api/v1/calls?label=sentiment/Negative` |
| 0:28–0:34 | Open Columns, hide Duration, show Compliance. The header and the table caption follow. | "Columns and row density are one reader's furniture, so they live in this browser and never in the URL. A link you send carries your question, not your layout. The Saved views control beside them is the opposite — shared team state — so it is read-only until someone signs in, and we come back to it." | client-side preference; the list request is unchanged |
| 0:34–0:40 | Clear the filters and search "double charged". | "Search here isn't a title match, it's full text over the transcripts — 'double charged' finds the one call about a duplicate premium charge, by what was actually said." | `GET /api/v1/calls?q=double+charged` |
| 0:40–0:47 | Open that call. The workspace: header and actions, player, moments track, transcript, inspector on Analysis. | "One page for the whole call: the recording, the transcript, a moments track along the top, and an inspector with the generated scorecard on the right." | `GET /api/v1/calls/{id}` |
| 0:47–0:54 | Click the Complaint segment on the moments track. | "The moments track is a timeline, not a chart. Clicking the Complaint segment scrubs the player and scrolls the transcript straight to that block." | client-side; timestamps come from the same call record |
| 0:54 | Inspector switches to Ask; click "Summarise this call". | "Now the ask panel." | `POST /api/v1/calls/{id}/ask` |
| 0:54–1:02 | The answer streams in; it finishes with a confidence badge and a "[1] source" citation. | "The answer streams from this call's own transcript and lands with a confidence read and a numbered citation, not just prose." | `POST /api/v1/calls/{id}/ask` |
| 1:02–1:11 | Click "[1] source". | "The citation is the point: clicking it flashes the exact transcript block the answer was drawn from and scrubs the player to that second. It is provably traceable, not decorative." | client-side citation resolution against the same call record |
| 1:11–1:18 | Ask "What is the customer's shoe size?" — a question this transcript cannot answer. | "Ask something the transcript has no basis for, and the product declines rather than guessing: 'Not enough data to answer this,' with no confidence badge and no citations. The refusal is the feature." | `POST /api/v1/calls/{id}/ask` |
| 1:18–1:26 | Click Share, create a link. | "Share creates a read-only, time-limited link to this exact call — transcript, moments and analysis — for anyone who has it, no account required." | `POST /api/v1/calls/{id}/shares` |
| 1:26–1:32 | Sidebar to Settings, Branding tab. The values are all there; the fields are disabled and a notice offers a way in. | "Everything so far has run signed in as nobody. Settings is not hidden from that visitor — they can read exactly what this deployment is configured to do. They just cannot change it." | `GET /api/v1/settings` |
| 1:32–1:37 | Sign in at `/admin/login` with the operator token; the Overview loads with a live connection check. | "Signing in as an operator does not open a different application. It is the same shell, the same screens, with an Operations section added and the edit controls switched on." | `POST /api/v1/admin/login`, `GET /api/v1/admin/health` |
| 1:37–1:43 | Back to the Negative-sentiment queue from 0:22. The Saved views menu now offers "Save this view"; name it and the control renames itself to the view. | "Here is that immediately. Same list, same filter — and now the menu that was read-only offers to save it. A view is server-side and shared: it is the team's definition of a queue, not a bookmark in one person's browser, which is exactly why issuing one is a write." | `POST /api/v1/views` |
| 1:43–1:50 | Settings → Branding. Change the product name; the preview follows as you type; save. The sidebar identity changes with it. | "White-labelling is a form, not a support ticket or a redeploy. The preview moves as you type, the save takes effect in the running process, and the environment variable it overrides is still there to reset back to. The rest of this recording runs under the new name." | `PUT /api/v1/settings/branding` |
| 1:50–1:57 | Settings → API keys. Create a key called "Reporting pipeline"; the secret appears once. | "A real key store, not an environment variable. The key material is shown exactly once — it is stored as a hash, so nobody can recover it, and the register shows only a preview afterwards. This one is revoked before the next shot; revoked, not deleted, because when a key was last used is what an incident review needs." | `POST /api/v1/api-keys`, then `DELETE /api/v1/api-keys/{id}` |
| 1:57–2:04 | Settings → Retention. Set a policy; the preview names the calls it would cover; start a purge and stop at the typed confirmation. | "Nothing is deleted on a timer — there is no background sweeper. A policy is recorded, previewed against the real data, and a purge only runs when someone types the count back. This recording stops there." | `GET /api/v1/retention/preview`, `POST /api/v1/retention/purge` with `dryRun` |
| 2:04–2:10 | Agents & Taxonomy. Open the Call Reason labelset. | "This is the taxonomy the whole product is built on, and it is editable. Each label's description is not documentation — it is literally the sentence the labeler agent reads when deciding whether the label applies." | `GET /api/v1/labelsets/{id}` |
| 2:10–2:17 | Create a new labelset, "Renewal Risk", with two labels and their instructions. It appears in the table as Customised and Applied. | "A new category is two fields and a sentence each. Saving it provisions it into the Knowledge Box and rebuilds the labeler agent's operations from it, so the vocabulary and the agent that applies it cannot drift apart." | `POST /api/v1/labelsets`, `POST /api/v1/labelsets/{id}/provision` |
| 2:17–2:24 | Agents tab, edit the `call-insights` instructions. | "The generative agent's instructions are editable too — the same text that produces the scorecard on every call page. The labeler agents deliberately have none of their own: theirs are built from the labelsets, and the screen says so rather than showing a prompt that is not real." | `PUT /api/v1/agents/call-insights` |
| 2:24–2:30 | `/api?op=listCalls`. Sixty operations from the served OpenAPI document; the try-it form for this one; type the same search into `q` and watch the curl change. | "Every screen in this recording is a client of one documented API, and the API is in the product. Sixty operations, generated from the document the server serves — with the parameters, the schemas, and a curl that is the request that would actually be sent." | `GET /api/v1/openapi.json` |
| 2:30–2:37 | Send it. 200, the timing, the headers, the body. | "And it is a real request against this deployment. That search you saw four minutes ago was this call." | `GET /api/v1/calls?q=double+charged` |
| 2:37–2:46 | `/admin/audit`. The newest rows are the branding change, the key issued and revoked, the labelset created, the agent re-instructed. | "Every configuration change is on the record — who, what, when, with secrets reduced to a boolean before they are stored. And this is the list of what this recording just did. 'Every setting is editable' is only a safe thing to say alongside 'and every edit is auditable'." | `GET /api/v1/admin/audit` |

## What was cut, and why

The previous recording ran 2:24 over twenty shots. Adding the eight new beats the
full-implementation pass earned — date window, saved views, columns, taxonomy editing, agent
instructions, the API explorer with a live request, API keys, retention and the audit trail —
would have pushed it past four minutes, so these were dropped to keep it under three:

- **Browse mode (the category rails).** The calls list is now represented by five beats — facets,
  the column picker, search, the drill-through and, in the operator half, a saved view — and the
  rails were the one that showed a way of *finding* calls rather than a capability. The dashboard's
  "Recent calls" cards already carry the same card treatment on screen.
- **The bulk bar (three rows ticked; export, re-run, delete).** It was an affordance the recording
  never exercised, and the brief's point is that the demo is the product. What replaced it —
  issuing and revoking a real API key, creating a real labelset — is the same idea actually done.
- **`/upload`.** A static form with nothing dropped on it. The ingest path is real and covered by
  `test/e2e/demo.spec.ts`; the honest version of that beat is a full upload with the stepper
  running, which does not fit in this budget. Upload is still one click away in the sidebar in
  every frame of the recording, and `/upload/history` lists every ingest that has run.
- **Redoc (`/api/v1/docs`) as the closing shot.** Superseded by the in-product API explorer, which
  does everything Redoc did and then sends the request. The explorer's coverage strip links to
  Redoc, Swagger UI and `openapi.json`, so the closing frame still names all three.
- **The admin Jobs tab** was folded into the Overview beat, whose recent-jobs and recent-errors
  panels show the same provenance without a navigation of its own.

Two things could not be shown, and are worth saying out loud:

- **An actual purge.** The retention beat stops at the typed confirmation. Running it would delete
  the sample calls every other beat depends on, and the recording has to be repeatable.
- **A clean audit trail on a re-recorded deployment.** The audit store, like the API-key register,
  is deliberately append-only — revoking rather than deleting is the product's decision. On a
  fresh `DATA_DIR` the final frame is exactly the tour's own changes; on a machine that has
  recorded before, they are the newest rows above the previous runs. `make clean` before recording
  gives the pristine frame.
