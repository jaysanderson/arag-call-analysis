# Storyboard — Call Analysis

Recorded at 1440×900 by `showcase/record.spec.ts` (`SHOWCASE=1`). One continuous Playwright run
produces the video (`showcase/out/record-showcase-walkthrough/video.webm`, 2:46) and the twenty-six
numbered screenshots below (`page.screenshot({ fullPage: false })`, so each frame matches exactly
what the viewport shows in the video at that moment). Every screenshot the spec writes has a row
here, and every row here is a screenshot the spec writes.

The run is one test, so the video is a single take. Shots S1–S14 are the analyst, signed in as
nobody; S15 is the same product to that visitor with the edit controls off; S16–S26 are the
operator. See `SCRIPT.md` for the narration, the timestamps and what was cut from the previous
2:24 version to make room.

| Shot | Script cue | Screen / framing | Emphasise | Approx. duration | Screenshot |
|---|---|---|---|---|---|
| S1 | 0:00 | `/welcome`, top of page | Four onboarding steps, all done; "See the analysis" button | ~4s | `01-welcome.png` |
| S2 | 0:04 | `/` dashboard, top of page | Six-tile stat strip (Calls, First-call resolution, Complaint rate, Cross-sell accepted, Avg compliance, Avg CSAT) and the four charts, across all 13 calls | ~5s | `02-dashboard.png` |
| S3 | 0:10 | `/?from=…`, after applying a custom window in the date picker | Range control showing the custom window; "7 calls outside this window"; every tile and chart recomputed to the 6 calls inside it | ~6s | `03-date-range.png` |
| S4 | 0:16 | Click "First-call resolution" → `/calls?label=disposition_flags%2FFirst-Call+Resolution&from=…` | Two chips — the label and "From 15 Jun 2026" — and a row count that matches the tile it came from | ~6s | `04-drill-through.png` |
| S5 | 0:22 | Fresh `/calls`, "Filter by Sentiment" → Negative ticked | Active facet chip, narrowed row count, live counts in the facet menus | ~5s | `05-facets.png` |
| S6 | 0:28 | Same list, Columns menu open | Duration unticked and Compliance ticked; the table behind showing the new column set; the caption counting columns; the Saved views control beside it, which this viewer cannot write to | ~6s | `06-columns.png` |
| S7 | 0:34 | `/calls?q=double+charged` | Search box, single matching result: the billing complaint call | ~5s | `07-search.png` |
| S8 | 0:40 | "Billing complaint - double-charged premium" workspace, top of page | Header with labels and actions, player, moments track, transcript, inspector on Analysis | ~7s | `08-workspace.png` |
| S9 | 0:47 | Same page, after clicking the Complaint segment on the moments track | Transcript scrolled and scrubbed to the cited block; Analysis panel scorecard on the right | ~6s | `09-moment-seek.png` |
| S10 | 0:54 | Ask tab, "Summarise this call" just clicked | Transient "Thinking…" frame before the stream lands | <1s | `10-asking.png` |
| S11 | 0:54–1:02 | Ask tab, answer complete | Streamed answer with an inline `[1]` marker, confidence badge, "[1] source" chip | ~8s | `11-answer.png` |
| S12 | 1:02–1:11 | Citation `[1] source` clicked | Moments-track segment and transcript block both highlighted at the cited paragraph | ~8s | `12-citation-scrub.png` |
| S13 | 1:11–1:18 | Ask tab, decline answered | "Not enough data to answer this." — no confidence badge, no citation chips | ~7s | `13-decline.png` |
| S14 | 1:18–1:26 | Share dialog, link created | "Share this call" dialog with the new link under "Active links" | ~8s | `14-share.png` |
| S15 | 1:26 | `/settings?tab=branding`, signed in as nobody | Every value legible, every field disabled, no Save button, and the "Sign in as an operator" notice that explains why | ~5s | `15-settings-read-only.png` |
| S16 | 1:32 | `/admin` after sign-in | "Overview" heading, "Knowledge Box reachable", the stat strip and the recent-jobs and recent-errors panels | ~5s | `16-operator-overview.png` |
| S17 | 1:37 | `/calls?label=sentiment%2FNegative`, Saved views menu open after saving "Negative sentiment" | The same list as S5 with the menu now offering more than a list: the new view ticked, its rename and delete actions, and the control renamed from "Saved views" to the view | ~6s | `17-saved-view.png` |
| S18 | 1:43 | `/settings?tab=branding`, product name changed and saved | "Signed in as an operator" chip, the live shell preview carrying the new name, "Overridden in the product" beside the reset control, and the sidebar identity already changed | ~6s | `18-branding.png` |
| S19 | 1:50 | `/settings?tab=api-keys`, immediately after creating a key | The once-only secret block — "This is the only time this key will ever be shown" — above the register with the new key Active | ~7s | `19-api-keys.png` |
| S20 | 1:57 | `/settings?tab=retention`, purge confirmation open | The policy, the preview counting the calls it would cover and naming the oldest five, and the typed confirmation standing between it and a deletion | ~6s | `20-retention.png` |
| S21 | 2:04 | `/taxonomy`, Call Reason labelset editor open | The label rows with their descriptions, and the line that says the description *is* the instruction the agent reads | ~6s | `21-labelset-instructions.png` |
| S22 | 2:10 | `/taxonomy`, labelsets table after saving "Renewal Risk" | The new row — `showcase_renewal`, Customised, 2 labels, Applied — sitting among the six shipped labelsets | ~6s | `22-labelset-created.png` |
| S23 | 2:17 | `/taxonomy`, Agents tab, `call-insights` prompt editor open with the edited instruction | The editable `call_analysis` prompt, and behind it the labeler agents explaining that theirs are built from the labelsets — the new "Renewal Risk" chip among them | ~7s | `23-agent-instructions.png` |
| S24 | 2:24 | `/api?op=listCalls` | Coverage strip ("60 operations … across 13 tags"), the grouped index, the operation's description and auth note, the try-it form with `q` filled, and the curl carrying it | ~5s | `24-api-explorer.png` |
| S25 | 2:30 | Same page, after "Send request" | 200 OK with the elapsed time and byte count, `content-type` and `x-request-id`, and the JSON body with the matching call in it | ~7s | `25-api-response.png` |
| S26 | 2:37–2:46 | `/admin/audit` | The newest rows — `settings.branding`, `apikey.create`, `apikey.revoke`, `labelset.create`, `agent.update` — all by `operator`, with expandable detail | ~8s | `26-audit.png` |

Total runtime: 2:46 (measured from the recorded file), one test so the video is a single continuous
take.

Convert the recorded webm to mp4 if `ffmpeg` is available (not committed — `showcase/out/` is
gitignored):

```bash
ffmpeg -i showcase/out/record-showcase-walkthrough/video.webm -c:v libx264 -pix_fmt yuv420p showcase/out/showcase.mp4
```

For a pristine final frame on S26 (the audit trail carrying only this run's changes, and the API-key
register on S19 carrying only this run's key), run `make clean` first: both stores are deliberately
append-only, so a machine that has recorded before keeps the earlier rows underneath.
