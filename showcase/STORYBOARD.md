# Storyboard — Call Analysis

Recorded at 1440×900 by `showcase/record.spec.ts` (`SHOWCASE=1`). One continuous Playwright run
produces the video (`showcase/out/record-showcase-walkthrough/video.webm`, 2:24) and the twenty
numbered screenshots below (`page.screenshot({ fullPage: false })`, so each frame matches exactly
what the viewport shows in the video at that moment). This follows
`design/PRODUCT-EXPERIENCE.md` §8 ("The guided path — Try with sample calls") step for step; the
one departure is noted in `SCRIPT.md` — the Knowledge Box is already seeded, so the onboarding
screen genuinely reads "See the analysis".

| Shot | Script cue | Screen / framing | Emphasise | Approx. duration | Screenshot |
|---|---|---|---|---|---|
| S1 | 0:00 | `/welcome`, top of page | Four onboarding steps, all done; "See the analysis" button | ~9s | `01-welcome.png` |
| S2 | 0:09 | `/` dashboard, top of page | Six-tile stat strip (Calls, First-call resolution, Complaint rate, Cross-sell accepted, Avg compliance, Avg CSAT) and the four charts | ~11s | `02-dashboard.png` |
| S3 | 0:20 | Click "Complaint rate" → `/calls?label=disposition_flags%2FComplaint+Raised` | Filtered heading, filter chip, filtered table rows | ~8s | `03-drilldown.png` |
| S4 | 0:28 | Fresh `/calls`, "Filter by Sentiment" → Negative ticked | Active facet chip, narrowed row count | ~8s | `04-facets.png` |
| S5 | 0:35 | `/calls`, search "double charged" | Search box, single matching result: the billing complaint call | ~8s | `05-search.png` |
| S6 | 0:43 | `/calls?mode=browse` | Category rails (Positive, Benefits & Coverage, …) with real cards and moment-map thumbnails | ~7s | `06-browse.png` |
| S7 | 0:50 | Table mode, three rows ticked | Bulk bar: "3 selected", Export / Re-run analysis / Delete | ~7s | `07-bulk.png` |
| S8 | 0:57 | "Billing complaint - double-charged premium" workspace, top of page | Header with labels and actions, player, moments track, transcript, inspector on Analysis | ~11s | `08-workspace.png` |
| S9 | 1:08 | Same page, after clicking the Complaint segment on the moments track | Transcript scrolled and scrubbed to the "0:48 Complaint" block; Analysis panel scorecard on the right | ~7s | `09-moment-seek.png` |
| S10 | 1:16 | Ask tab, "Summarise this call" just clicked | Transient "Thinking…" frame before the stream lands | <1s | `10-asking.png` |
| S11 | 1:16–1:25 | Ask tab, answer complete | Streamed answer with an inline `[1]` marker, "High confidence" badge, "[1] source" chip | ~9s | `11-answer.png` |
| S12 | 1:25–1:35 | Citation `[1] source` clicked | Moments-track segment and transcript block both highlighted at the cited paragraph | ~10s | `12-citation-scrub.png` |
| S13 | 1:35–1:43 | Ask tab, decline answered | "Not enough data to answer this." — no confidence badge, no citation chips | ~8s | `13-decline.png` |
| S14 | 1:43–1:51 | Share dialog, link created | "Share this call" dialog with the new link under "Active links" | ~8s | `14-share.png` |
| S15 | 1:51 | `/upload` | Dropzone, metadata form, upload stepper | ~6s | `15-upload.png` |
| S16 | 1:57 | `/taxonomy`, Agents tab | The three agents — resource-labeler, paragraph-labeler, call-insights — with type, description and state | ~6s | `16-taxonomy.png` |
| S17 | 2:03 | `/settings?tab=branding`, product name changed | Branding form plus the live shell preview re-rendering the new name | ~5s | `17-branding.png` |
| S18 | 2:09 | `/admin` after sign-in | "Overview" heading, "Knowledge Box reachable" status, stat strip | ~5s | `18-admin-overview.png` |
| S19 | 2:14 | `/admin/jobs` | "Nothing to show yet." — honest empty state; the box was seeded at process start, not through a job | ~5s | `19-admin-jobs.png` |
| S20 | 2:19–2:24 | `/api/v1/docs` (Redoc) | API reference page title | ~5s | `20-api-docs.png` |

Total runtime: 2:24 (144.16s measured from the recorded file), one test so the video is a single
continuous take.

Convert the recorded webm to mp4 if `ffmpeg` is available (not committed — `showcase/out/` is
gitignored):

```bash
ffmpeg -i showcase/out/record-showcase-walkthrough/video.webm -c:v libx264 -pix_fmt yuv420p showcase/out/showcase.mp4
```
