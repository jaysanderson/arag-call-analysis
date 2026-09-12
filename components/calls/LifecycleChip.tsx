import { StateChip, type StateTone } from "@/components/kit";
import { type CallLifecycle, isInFlight, LIFECYCLE_COPY } from "@/lib/lifecycle";

/**
 * One word for where a call has got to, everywhere a call is listed or opened.
 *
 * Colour is never the only signal — the chip always carries the word — and in-flight states carry
 * the animated dot so a reader can tell "still working" from "finished, and this is the answer".
 */
const TONE: Record<CallLifecycle, StateTone> = {
  queued: "muted",
  transcribing: "neutral",
  labelling: "neutral",
  partial: "warn",
  analysed: "ok",
  failed: "error",
};

export function LifecycleChip({ state }: { state?: CallLifecycle }) {
  if (!state) return null;
  const copy = LIFECYCLE_COPY[state];
  return (
    <StateChip tone={TONE[state]} busy={isInFlight(state)} title={copy.hint}>
      {copy.label}
    </StateChip>
  );
}
