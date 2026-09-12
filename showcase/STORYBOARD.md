# Storyboard — Call Analysis

Recorded at 1440×900 by `showcase/record.spec.ts` (`make showcase`, `SHOWCASE=1`). One continuous
Playwright run produces the video (`showcase/out/record-showcase-walkthrough/video.webm`) and the
numbered screenshots below. Screenshots are viewport captures (`fullPage: false`), so each frame
matches exactly what the video shows at that moment.

The path is `design/PRODUCT-EXPERIENCE.md` §8 step for step, with one honest divergence: the
showcase environment's mock Knowledge Box is already seeded, so the onboarding screen offers
**See the analysis** rather than **Try with sample calls**. It is recorded as it is.

| Shot | Script cue | Screen and framing | Emphasise | Approx. | Screenshot |
|---|---|---|---|---|---|
| S1 | 0:00 | `/welcome`, viewport at load | Four steps, each with its live state and a green tick where it is already true | ~8s | `01-welcome.png` |
| S2 | 0:08 | `/` dashboard after **See the analysis** | Six-tile stat strip, then the charts and the by-agent breakdown below | ~14s | `02-dashboard.png` |
| S3 | 0:22 | `/calls?label=disposition_flags%2FComplaint+Raised` after clicking the Complaint rate tile | The filter chip already applied, the result count, the table underneath | ~10s | `03-drilldown.png` |
| S4 | 0:32 | `/calls`, Sentiment facet open, **Negative** ticked | Facet counts in the dropdown, the new chip, the narrowed row count | ~10s | `04-facets.png` |
| S5 | 0:42 | `/calls`, search box carrying `double charged` | The matching call at the top of the table | ~8s | `05-search.png` |
| S6 | 0:50 | `/calls?mode=browse` | Category rails with live counts and per-call moment-map thumbnails | ~8s | `06-browse.png` |
| S7 | 0:58 | `/calls` table mode, three rows ticked | The bulk bar in place of the header row: Export, Re-run analysis, Delete | ~8s | `07-bulk.png` |
| S8 | 1:06 | A call workspace, top of page | Player, the moments track under the scrub bar, transcript, inspector on Analysis | ~12s | `08-workspace.png` |
| S9 | 1:18 | Same page, a coloured moments segment clicked | Player position moved, transcript block highlighted in place | ~8s | `09-moment-seek.png` |
| S10 | 1:26 | Inspector → Ask, question submitted, answer mid-stream | Prose arriving with superscript markers appearing as it writes | ~6s | `10-asking.png` |
| S11 | 1:32 | Ask tab, answer complete | The trust row: confidence badge, then a numbered citation chip per source | ~12s | `11-answer.png` |
| S12 | 1:44 | A citation chip clicked | The cited transcript block flashing, the player scrubbed to that second | ~10s | `12-citation-scrub.png` |
| S13 | 1:54 | A question the transcript cannot answer | The decline, with no confidence badge and no citations beneath it | ~8s | `13-decline.png` |
| S14 | 2:02 | Share dialog open, link created | The expiry control and the active link with its revoke action | ~6s | `14-share.png` |
| S15 | 2:08 | `/upload` | Dropzone, the metadata form, the three-step stepper | ~6s | `15-upload.png` |
| S16 | 2:14 | `/taxonomy` | Labelsets with level, label count, applied count and provisioning state | ~6s | `16-taxonomy.png` |
| S17 | 2:20 | `/settings?tab=branding` | The live shell preview and the exact `BRAND_*` block to copy | ~4s | `17-branding.png` |
| S18 | 2:24 | `/admin` | The operator product in the same shell: stat strip, recent jobs, recent errors | ~3s | `18-admin-overview.png` |
| S19 | 2:26 | `/admin/jobs` | A job with its stage timeline — the provenance of everything just seen | ~3s | `19-admin-jobs.png` |
| S20 | 2:29 | `/api/v1/docs` (Redoc) | The API every screen in the recording was a client of | ~3s | `20-api-docs.png` |

Total runtime: about 2:30, one serial test, so the video is a single continuous take.

Convert the recorded webm to mp4 if `ffmpeg` is available (not committed — `showcase/out/` is
gitignored):

```bash
ffmpeg -i showcase/out/record-showcase-walkthrough/video.webm \
  -c:v libx264 -pix_fmt yuv420p showcase/out/showcase.mp4
```
