# Overview

## What it is

Call Analysis turns recorded contact-centre calls into structured, searchable business
intelligence — automatically, without anyone listening to a call, tagging it by hand, or writing
a summary. Upload a recording or a transcript; within minutes it is transcribed, classified,
scored and summarized, and shows up on a dashboard alongside every other call.

## The value

A contact centre generates more call recordings than any team can realistically review. The usual
choices are: sample a tiny fraction of calls for manual QA, rely on agents to self-report outcomes
in a wrap-up form, or simply not know what actually happened on most calls. Call Analysis instead
gives every single call the same treatment a QA analyst would give the handful they have time to
review:

- **A structured read of every call** — reason for the call, outcome, sentiment, whether a
  complaint was raised, whether the agent offered (and the member accepted) another product,
  whether the issue was resolved on the first contact, an estimated satisfaction score, and a
  compliance score.
- **A narrative summary and scorecard** — a two-to-three sentence executive summary, the agent's
  empathy/compliance/resolution scores, notable quotes, risk flags, and concrete action items —
  the kind of write-up a supervisor would produce after listening to the whole call, generated in
  the time it takes to read this sentence.
- **A synced, searchable transcript** — every call's transcript is broken into moments (a
  complaint, an escalation, a cross-sell pitch, a compliance disclosure, a PII moment) that line
  up with the exact point in the recording, so a reviewer can jump straight to the moment that
  matters instead of scrubbing through an hour of audio.
- **A conversational way to ask about any single call** — "Was the member satisfied?", "What did
  the agent offer?" — answered only from that call's own transcript, with a clickable citation
  that jumps the audio/video player to the exact moment the answer came from, and an honest
  confidence signal rather than a made-up-sounding answer.
- **An aggregated view across every call** — a dashboard of first-call-resolution rate, complaint
  rate, cross-sell acceptance, average compliance and CSAT, breakdowns by reason, sentiment, line
  of business and outcome, and a sortable breakdown by agent or by queue, refreshed as new calls
  come in. Every tile and row drills through into the underlying calls, filtered to match.
- **A searchable, filterable table of every call** — search, facet filters with live counts,
  sortable columns and a lifecycle status (queued, transcribing, labelling, partly analysed,
  analysed, failed) for every call, with every filter kept in the page's address so a view can be
  shared or bookmarked.

## What it is not

It does not replace a contact-centre platform, a telephony system, or a case-management tool. It
does not decide anything on its own — every generated label, score and summary is a read of what
happened, presented for a human to act on, filter by, or drill into. It does not fabricate
answers: a question the transcript genuinely does not ground is answered with an honest decline,
never a guess.

## Who it's for

Team leads and QA supervisors who need visibility across a whole queue instead of a small manual
sample; compliance and retention teams who need to find every call with a specific pattern (every
complaint, every retention save, every compliance disclosure) without listening to each one;
and agents or reviewers who need to answer a specific question about one call fast, with proof.

## How it's built

Every piece of intelligence in this product — the transcript, the labels, the summary, the
metrics, the grounded chat — comes from Progress Agentic RAG (ARAG). This product does not run its
own transcription, its own classification model, or its own language model: it configures ARAG's
transcription, its data-augmentation agents, and its retrieval-augmented question answering, and
presents the results. See [When to use](when-to-use.md) for the practical implications of that,
and the [Architecture](../architecture/architecture.md) docs for how it works end to end.
