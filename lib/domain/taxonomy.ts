/**
 * Domain model for health-insurance call analysis.
 * - Resource labelsets  -> applied by the resource-labeler agent (on=1)
 * - Paragraph labelset  -> applied by the paragraph-labeler agent (on=0)
 * - Generated JSON fields -> produced by two `ask` agents (on=1)
 *
 * Labelers auto-create the labelset identified by `ident`; we ALSO pre-create
 * the labelsets here so they carry stable titles/colors for the UI filters.
 */

export type LabelDef = { label: string; description: string; examples?: string[] };
export type LabelsetDef = {
  id: string;
  title: string;
  color: string;
  multiple: boolean;
  kind: "RESOURCES" | "PARAGRAPHS";
  labels: LabelDef[];
};

// ---- Resource-level labelsets (call-list filters) ----
export const RESOURCE_LABELSETS: LabelsetDef[] = [
  {
    id: "call_reason",
    title: "Call Reason",
    color: "#2563eb",
    multiple: false,
    kind: "RESOURCES",
    labels: [
      { label: "Claims", description: "Status, denial, payment, or submission of a medical/dental claim." },
      { label: "Billing & Payments", description: "Premiums, invoices, autopay, refunds, payment failures." },
      {
        label: "Enrollment & Eligibility",
        description:
          "Signing up, adding/removing dependents, plan changes, effective dates, eligibility checks.",
      },
      {
        label: "Benefits & Coverage",
        description:
          "What is covered, copays, deductibles, out-of-pocket maximums, in/out of network coverage questions.",
      },
      {
        label: "Prior Authorization",
        description: "Pre-approval for procedures, imaging, surgery, or specialist referrals.",
      },
      {
        label: "Provider Network",
        description: "Finding in-network doctors, hospitals, or specialists; provider directory issues.",
      },
      {
        label: "Pharmacy & Rx",
        description: "Prescription drug coverage, formulary, pharmacy benefits, medication cost.",
      },
      {
        label: "Complaint",
        description:
          "Member is primarily calling to complain about service, denial, billing error, or experience.",
      },
      {
        label: "Cancellation & Retention",
        description: "Member wants to cancel, downgrade, or is shopping competitors.",
      },
      { label: "Portal & Tech Support", description: "Login, app, ID card, website, or technical issues." },
    ],
  },
  {
    id: "call_outcome",
    title: "Outcome",
    color: "#16a34a",
    multiple: false,
    kind: "RESOURCES",
    labels: [
      { label: "Resolved", description: "Member's issue was fully resolved on this call." },
      {
        label: "Follow-up Required",
        description: "Resolution pending a callback, document, or future action.",
      },
      { label: "Escalated", description: "Routed to a supervisor, specialist team, or grievance process." },
      { label: "Transferred", description: "Handed to another department without resolution." },
      { label: "Unresolved", description: "Call ended without resolving the member's issue." },
    ],
  },
  {
    id: "sentiment",
    title: "Sentiment",
    color: "#db2777",
    multiple: false,
    kind: "RESOURCES",
    labels: [
      { label: "Positive", description: "Member was satisfied/grateful overall." },
      { label: "Neutral", description: "Matter-of-fact, no strong emotion." },
      { label: "Negative", description: "Member was frustrated, upset, or angry overall." },
      { label: "Mixed", description: "Started negative but improved, or vice versa." },
    ],
  },
  {
    id: "line_of_business",
    title: "Line of Business",
    color: "#9333ea",
    multiple: false,
    kind: "RESOURCES",
    labels: [
      { label: "Individual & Family", description: "Individual or family commercial plan." },
      { label: "Medicare Advantage", description: "Medicare Advantage / senior plans." },
      { label: "Medicaid", description: "Medicaid / state-sponsored plans." },
      { label: "Employer Group", description: "Coverage through an employer group plan." },
      { label: "Dental & Vision", description: "Standalone dental or vision plan." },
      {
        label: "Supplemental",
        description: "Supplemental/ancillary products (accident, critical illness, hospital indemnity).",
      },
    ],
  },
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
      {
        label: "Compliance Risk",
        description: "Possible compliance issue: missing disclosure, PHI mishandling, unverified identity.",
      },
      { label: "Coverage Denied", description: "A claim, service, or authorization was denied." },
      {
        label: "First-Call Resolution",
        description: "Issue resolved on the first contact with no follow-up.",
      },
      {
        label: "Vulnerable Member",
        description: "Member appears elderly, distressed, or in a sensitive health situation.",
      },
    ],
  },
];

// ---- Paragraph-level labelset (highlight specific moments) ----
export const PARAGRAPH_LABELSET: LabelsetDef = {
  id: "moment",
  title: "Call Moment",
  color: "#0891b2",
  multiple: true,
  kind: "PARAGRAPHS",
  labels: [
    { label: "Greeting & Verification", description: "Opening, identity verification, HIPAA verification." },
    { label: "Problem Statement", description: "The member explains why they are calling." },
    { label: "Complaint", description: "The member expresses dissatisfaction, frustration, or a grievance." },
    { label: "Cross-sell Pitch", description: "The agent pitches an additional product, plan, or upgrade." },
    { label: "Objection", description: "The member pushes back, hesitates, or declines an offer." },
    {
      label: "Resolution",
      description: "The agent resolves the issue or states the resolution/next steps for the problem.",
    },
    {
      label: "Compliance Disclosure",
      description: "Required disclosure, recording notice, terms, or regulatory script.",
    },
    { label: "Escalation", description: "The call is escalated to a supervisor or specialist." },
    { label: "Empathy Statement", description: "The agent acknowledges feelings or expresses empathy." },
    { label: "Next Steps", description: "Wrap-up, summary of actions, and what happens next." },
    {
      label: "Sensitive / PII",
      description: "Personal, health, or payment information is shared (SSN, DOB, diagnosis, card number).",
    },
  ],
};

export const ALL_LABELSETS: LabelsetDef[] = [...RESOURCE_LABELSETS, PARAGRAPH_LABELSET];

// ===== Augmentation agents (data augmentation "tasks") =====

// Build label operations for a labeler task from labelset definitions.
function labelOps(sets: LabelsetDef[]) {
  return sets.map((ls) => ({
    label: {
      ident: ls.id,
      description: `Classify the call by ${ls.title}. ${ls.multiple ? "Apply all that genuinely apply." : "Choose the single best label."}`,
      multiple: ls.multiple,
      labels: ls.labels.map((l) => ({
        label: l.label,
        description: l.description,
        examples: l.examples ?? [],
      })),
    },
  }));
}

const ANALYSIS_PROMPT = `You are a call-analysis engine for a US health-insurance contact center. Analyze the call transcript and return ONLY a JSON object with exactly these keys:
{
  "executive_summary": string (2-3 sentence summary of the whole call),
  "member_intent": string (why the member called, one sentence),
  "key_topics": string[] (3-6 short topic tags),
  "agent_scorecard": { "empathy": number (0-100), "compliance": number (0-100), "resolution_effectiveness": number (0-100) },
  "complaint": { "present": boolean, "category": string|null, "severity": "low"|"medium"|"high"|null, "quote": string|null },
  "cross_sell": { "offered": boolean, "product": string|null, "accepted": boolean, "objection": string|null },
  "action_items": string[] (concrete follow-ups, empty if none),
  "risk_flags": string[] (compliance/retention/clinical risks, empty if none),
  "notable_quotes": [ { "speaker": "Agent"|"Member", "quote": string } ]
}
Base every field strictly on the transcript. Do not invent facts.`;

const METRICS_PROMPT = `You are a call-analytics engine for a US health-insurance contact center. Analyze the call transcript and return ONLY a FLAT JSON object of metrics suitable for dashboard aggregation, with exactly these keys (use the allowed values):
{
  "call_reason": one of ["Claims","Billing & Payments","Enrollment & Eligibility","Benefits & Coverage","Prior Authorization","Provider Network","Pharmacy & Rx","Complaint","Cancellation & Retention","Portal & Tech Support"],
  "outcome": one of ["Resolved","Follow-up Required","Escalated","Transferred","Unresolved"],
  "sentiment": one of ["Positive","Neutral","Negative","Mixed"],
  "line_of_business": one of ["Individual & Family","Medicare Advantage","Medicaid","Employer Group","Dental & Vision","Supplemental"],
  "complaint": boolean,
  "complaint_category": string|null,
  "cross_sell_offered": boolean,
  "cross_sell_accepted": boolean,
  "csat_estimate": integer 1-5,
  "compliance_score": integer 0-100,
  "first_call_resolution": boolean,
  "escalated": boolean,
  "product_mentioned": string|null
}
Base every field strictly on the transcript. Do not invent facts.`;

// The KB's managed generative model. Data augmentation agents REQUIRE an llm
// block (without it the task fails). provider "openai" + the KB model works
// with Nuclia-managed keys (no BYO key needed).
export const AGENT_LLM: { model: string; provider: string } = {
  model: process.env.ARAG_GENERATIVE_MODEL || "chatgpt-azure-4o",
  provider: "openai",
};

export type AgentDef = {
  key: string;
  type: "labeler" | "ask";
  description: string;
  parameters: Record<string, unknown>;
};

const RAW_AGENTS: AgentDef[] = [
  {
    key: "resource-labeler",
    type: "labeler",
    description:
      "Classifies each whole call into reason, outcome, sentiment, line of business and disposition flags.",
    parameters: { name: "resource-labeler", on: 1, operations: labelOps(RESOURCE_LABELSETS) },
  },
  {
    key: "paragraph-labeler",
    type: "labeler",
    description:
      "Tags individual transcript blocks with call moments (complaint, cross-sell pitch, resolution, …).",
    parameters: { name: "paragraph-labeler", on: 0, operations: labelOps([PARAGRAPH_LABELSET]) },
  },
  {
    // Both JSON generators live in ONE task: the platform allows only one
    // running task per operation type (two separate `ask` tasks => 422).
    key: "call-insights",
    type: "ask",
    description:
      "Writes the structured call_analysis and call_metrics fields used by the detail page and the dashboard.",
    parameters: {
      name: "call-insights",
      on: 1,
      operations: [
        {
          ask: {
            // `question` is required; we omit user_prompt so the platform's
            // default template injects the field text as {context}. json:true
            // needs a registered KV schema (unavailable here), so we emit JSON
            // text via the prompt and parse the destination field in the app.
            question: ANALYSIS_PROMPT,
            destination: "call_analysis",
            json: false,
          },
        },
        {
          ask: {
            question: METRICS_PROMPT,
            destination: "call_metrics",
            json: false,
          },
        },
      ],
    },
  },
];

// Inject the required LLM block into every agent.
export const AGENTS: AgentDef[] = RAW_AGENTS.map((a) => ({
  ...a,
  parameters: { ...a.parameters, llm: AGENT_LLM },
}));
