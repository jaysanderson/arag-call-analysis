export type ResourceLabel = { labelset: string; label: string };

export type CallParagraph = {
  index: number;
  text: string;
  charStart: number; // offset into the field's extracted text (matches citation ranges)
  charEnd: number;
  startSeconds?: number;
  endSeconds?: number;
  kind: string;
  moments: string[]; // paragraph-level "moment" labels
  speaker?: "Agent" | "Member";
};

export type AgentScorecard = { empathy: number; compliance: number; resolution_effectiveness: number };

export type CallAnalysis = {
  executive_summary?: string;
  member_intent?: string;
  key_topics?: string[];
  agent_scorecard?: AgentScorecard;
  complaint?: { present: boolean; category?: string | null; severity?: string | null; quote?: string | null };
  cross_sell?: { offered: boolean; product?: string | null; accepted: boolean; objection?: string | null };
  action_items?: string[];
  risk_flags?: string[];
  notable_quotes?: { speaker: string; quote: string }[];
};

export type CallMetrics = {
  call_reason?: string;
  outcome?: string;
  sentiment?: string;
  line_of_business?: string;
  complaint?: boolean;
  complaint_category?: string | null;
  cross_sell_offered?: boolean;
  cross_sell_accepted?: boolean;
  csat_estimate?: number;
  compliance_score?: number;
  first_call_resolution?: boolean;
  escalated?: boolean;
  product_mentioned?: string | null;
};

export type CallSummary = {
  id: string;
  slug: string;
  title: string;
  icon: string;
  mediaType: "audio" | "video" | "transcript";
  createdISO?: string;
  durationSec?: number;
  agentName?: string;
  memberId?: string;
  queue?: string;
  labels: ResourceLabel[];
  metrics?: CallMetrics;
};

export type CallDetail = CallSummary & {
  fieldId: string; // content field id (e.g. "media" or "transcript")
  fieldType: "files" | "texts";
  transcriptText: string;
  paragraphs: CallParagraph[];
  analysis?: CallAnalysis;
};
