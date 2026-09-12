# Storyboard — Call Analysis

Recorded at 1440×900 by `showcase/record.spec.ts` (`make showcase`, `SHOWCASE=1`). One continuous
Playwright run produces the video (`showcase/out/**/video.webm`) and the numbered screenshots below
(`page.screenshot({ fullPage: false })`, so each frame matches exactly what the viewport shows in
the video at that moment).

| Shot | Script cue | Screen / framing | Emphasise | Approx. duration | Screenshot |
|---|---|---|---|---|---|
| S1 | 0:00 | `/` dashboard, top of page, viewport at load | KPI row (Total calls, First-call resolution, Complaint rate, Cross-sell accept) | ~12s | `01-dashboard.png` |
| S2 | 0:12 | `/` scrolled to the chart row | "Calls by reason", "Sentiment mix", "Cross-sell funnel" | ~13s | `02-charts.png` |
| S3 | 0:25 | Click "Complaint rate" KPI → `/calls?label=disposition_flags%2FComplaint+Raised` | Filtered heading + facet chip highlighted, filtered card count | ~15s | `03-drilldown.png` |
| S4 | 0:40 | Fresh `/calls`, facet "Billing & Payments" clicked | Active facet chip + filtered result cards | ~8s | `04-calls-facet.png` |
| S5 | 0:48 | `/calls`, transcript search "premium" typed | Search box + semantic-match result cards | ~8s | `05-calls-search.png` |
| S6 | 0:55 | First call's detail page, top: media player + transcript with moment chips | Video/audio player, moment chip row, "AI Analysis" panel on the right | ~20s | `06-call-detail.png` |
| S7 | 1:15–1:20 | Same page, Ask panel, "Summarize this call" clicked, answer mid-stream | "Thinking…" replaced by streaming prose with `[1]` markers appearing | ~5s | `07-asking.png` |
| S8 | 1:20–1:45 | Ask panel, completed answer | Confidence badge + numbered source chips under the answer | ~10s | `08-answer.png` |
| S9 | 1:45–2:00 | Citation `[1] source` clicked | Transcript paragraph with the `.flash` highlight, player scrubbed to that timestamp | ~15s | `09-citation-scrub.png` |
| S10 | 2:00–2:10 | "How this works" drawer open (Progress band, top-right) | The step-by-step flow diagram for the call-detail page | ~10s | `10-how-it-works.png` |
| S11 | 2:10 | `/admin/login` → `/admin` after sign-in | "Operations" heading, "Knowledge Box reachable" status pill | ~8s | `11-admin-overview.png` |
| S12 | 2:12–2:16 | `/admin/health` | "OK · N ms" status pill, Generative model row | ~6s | `12-admin-health.png` |
| S13 | 2:16–2:20 | `/admin/agents` | The three agents: resource-labeler, paragraph-labeler, call-insights | ~6s | `13-admin-agents.png` |
| S14 | 2:20–2:25 | `/api/v1/docs` (Redoc) | Page title / API reference | ~5s | `14-api-docs.png` |

Total runtime: ~2:25, one serial test so the video is a single continuous take.

Convert the recorded webm to mp4 if `ffmpeg` is available (not committed — `showcase/out/` is
gitignored):

```bash
ffmpeg -i showcase/out/*/showcase-walkthrough*/video.webm -c:v libx264 -pix_fmt yuv420p showcase/out/showcase.mp4
```
