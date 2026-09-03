import { type ReactNode } from "react";

/**
 * Minimal, dependency-free markdown renderer for ARAG-generated answer text
 * (gate 8: agent/AI answer text must render through a real markdown
 * component, never raw ** / # syntax on screen), with optional inline
 * superscript citation markers spliced in at the exact char offset ARAG's
 * /ask citations map reports for the answer text (standard B33).
 *
 * Handles the documented ARAG "loose list" gotcha: numbered/bulleted lists
 * routinely come back with a blank line between every item
 * ("1. ...[blank]2. ...[blank]3. ..."). A naive line-by-line renderer closes
 * the list on the first blank line and starts a new single-item list per
 * line, so every item restarts the native counter at "1.". This renderer
 * peeks past blank lines to see whether the list continues before closing.
 */

type Block =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "p"; text: string };

const UL_RE = /^\s*[-*]\s+(.*)$/;
const OL_RE = /^\s*\d+[.)]\s+(.*)$/;
const H_RE = /^(#{1,3})\s+(.*)$/;

// Sentinel wrapping a spliced-in citation number: <<<CITE:3>>>. This exact
// bracketed token never occurs in real ARAG answer text, so — unlike a bare
// number — splicing it in can't collide with ordinary prose ("wait 3
// minutes", "24 calls this week").
const CITE_TOKEN = /<<<CITE:(\d+)>>>/;
const CITE_TOKEN_G = /<<<CITE:(\d+)>>>/g;

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    const h = line.match(H_RE);
    if (h) {
      blocks.push({ type: "heading", level: h[1].length as 1 | 2 | 3, text: h[2].trim() });
      i++;
      continue;
    }

    const ulMatch = line.match(UL_RE);
    const olMatch = line.match(OL_RE);
    if (ulMatch || olMatch) {
      const kind = ulMatch ? "ul" : "ol";
      const re = ulMatch ? UL_RE : OL_RE;
      const items: string[] = [];
      let j = i;
      while (j < lines.length) {
        const m = lines[j].match(re);
        if (m) {
          items.push(m[1].trim());
          j++;
          continue;
        }
        if (!lines[j].trim()) {
          // Blank line — peek ahead past any run of blank lines to see if
          // this loose list continues before deciding to close it.
          let k = j;
          while (k < lines.length && !lines[k].trim()) k++;
          if (k < lines.length && lines[k].match(re)) {
            j = k;
            continue;
          }
          break;
        }
        break;
      }
      blocks.push({ type: kind, items } as Block);
      i = j;
      continue;
    }

    // Paragraph: collect until a blank line or a new block starts.
    let j = i;
    const buf: string[] = [];
    while (j < lines.length && lines[j].trim() && !lines[j].match(H_RE) && !lines[j].match(UL_RE) && !lines[j].match(OL_RE)) {
      buf.push(lines[j]);
      j++;
    }
    blocks.push({ type: "p", text: buf.join(" ").trim() });
    i = j;
  }

  return blocks;
}

/** Inline emphasis, code, links and spliced citation markers. */
function inline(text: string, keyBase: string, onCite?: (n: number) => void): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|<<<CITE:\d+>>>)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    const cite = tok.match(CITE_TOKEN);
    if (cite) {
      const n = Number(cite[1]);
      nodes.push(
        <button
          key={`${keyBase}-${idx++}`}
          type="button"
          onClick={() => onCite?.(n)}
          className="mx-0.5 -translate-y-1.5 rounded-sm px-0.5 align-super text-[10px] font-semibold text-brand-600 hover:bg-brand-100 hover:underline"
          title={`Jump to source ${n}`}
        >
          [{n}]
        </button>,
      );
    } else if (tok.startsWith("**")) {
      nodes.push(<strong key={`${keyBase}-${idx++}`}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("`")) {
      nodes.push(
        <code key={`${keyBase}-${idx++}`} className="rounded bg-brand-50 px-1 py-0.5 text-[0.85em]">
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (tok.startsWith("[")) {
      const close = tok.indexOf("](");
      const label = tok.slice(1, close);
      const href = tok.slice(close + 2, -1);
      nodes.push(
        <a key={`${keyBase}-${idx++}`} href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          {label}
        </a>,
      );
    } else {
      nodes.push(<em key={`${keyBase}-${idx++}`}>{tok.slice(1, -1)}</em>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/**
 * When two or more citations' answerRanges collapse to the SAME end offset
 * (ARAG's /ask citations map sometimes reports every citation on a
 * multi-fact synthesized answer as supporting the whole answer -
 * [0, answer.length] - rather than a precise per-claim sub-range), spread
 * them across the answer's own real sentence boundaries instead of
 * stacking every marker at that one shared spot. Found live by
 * demo-tester (3 Sep 2026): "Summarize this call" put all three markers
 * bunched after the final sentence, not at the copay/declined-offer claims
 * each one actually supports. A single-fact answer with one genuine
 * per-citation range is untouched - this only fires on a genuine tie, and
 * it never invents a specific claim-to-citation mapping ARAG didn't
 * report; it distributes honestly across real sentence ends so a
 * synthesized answer's separate claims each carry a marker.
 */
function spreadTiedMarks(text: string, marks: { end: number; n: number }[]): { end: number; n: number }[] {
  if (marks.length < 2) return marks;
  const groups = new Map<number, { end: number; n: number }[]>();
  for (const m of marks) {
    const g = groups.get(m.end) ?? [];
    g.push(m);
    groups.set(m.end, g);
  }
  const out: { end: number; n: number }[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) {
      out.push(...group);
      continue;
    }
    // Real sentence-end offsets in the source text, in reading order. Skips
    // the abbreviation trap (a lone capital / "Dr"/"Mr"/"vs"/"etc" before
    // the period) the same way the factory's proven [[n]] injector does.
    const boundaries: number[] = [];
    const re = /(\S*)[.!?](?:\s|$)/g;
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(text)) !== null) {
      if (/^(Mr|Mrs|Ms|Dr|St|vs|etc|[A-Z])$/i.test(mm[1])) continue;
      boundaries.push(mm.index + mm[0].length - (mm[0].endsWith(" ") ? 1 : 0));
    }
    if (boundaries.length < 2) {
      out.push(...group); // nothing real to spread across - leave as-is
      continue;
    }
    const ordered = [...group].sort((a, b) => a.n - b.n);
    ordered.forEach((m, i) => out.push({ end: boundaries[Math.min(i, boundaries.length - 1)], n: m.n }));
  }
  return out;
}

/** Splice citation-marker sentinels into raw text at each mark's end offset. */
function spliceCitationMarks(text: string, rawMarks: { end: number; n: number }[]): string {
  if (!rawMarks.length) return text;
  const marks = spreadTiedMarks(text, rawMarks);
  const groups = new Map<number, number[]>();
  for (const m of marks) {
    const end = Math.min(Math.max(m.end, 0), text.length);
    const g = groups.get(end) ?? [];
    g.push(m.n);
    groups.set(end, g);
  }
  const positions = [...groups.keys()].sort((a, b) => b - a); // right-to-left so earlier offsets stay valid
  let out = text;
  for (const end of positions) {
    const ns = [...groups.get(end)!].sort((a, b) => a - b); // ascending, so ties render [1][2] not [2][1]
    const token = ns.map((n) => `<<<CITE:${n}>>>`).join("");
    out = out.slice(0, end) + token + out.slice(end);
  }
  return out;
}

export function Markdown({
  text,
  className,
  citations,
  onCite,
}: {
  text: string;
  className?: string;
  citations?: { end: number; n: number }[];
  onCite?: (n: number) => void;
}) {
  if (!text) return null;
  const source = citations?.length ? spliceCitationMarks(text, citations) : text;
  const blocks = parseBlocks(source);
  const headingTags = ["h4", "h5", "h6"] as const;
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      {blocks.map((b, i) => {
        if (b.type === "heading") {
          const Tag = headingTags[b.level - 1];
          return (
            <Tag key={i} className="font-display font-semibold text-ink-950">
              {inline(b.text, `h${i}`, onCite)}
            </Tag>
          );
        }
        if (b.type === "ul") {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {b.items.map((it, j) => (
                <li key={j}>{inline(it, `ul${i}-${j}`, onCite)}</li>
              ))}
            </ul>
          );
        }
        if (b.type === "ol") {
          return (
            <ol key={i} className="list-decimal space-y-1 pl-5">
              {b.items.map((it, j) => (
                <li key={j}>{inline(it, `ol${i}-${j}`, onCite)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={i} className="leading-relaxed">
            {inline(b.text, `p${i}`, onCite)}
          </p>
        );
      })}
    </div>
  );
}

/** Strip our sentinel + raw markdown syntax for places that need plain text. */
export function stripMarkdown(text: string): string {
  return text.replace(CITE_TOKEN_G, "").replace(/[*_`#]/g, "");
}
