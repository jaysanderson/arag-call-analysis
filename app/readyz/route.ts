import { getRuntime } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Readiness: the runtime booted and the Knowledge Box answers. */
export async function GET(): Promise<Response> {
  try {
    const rt = await getRuntime();
    const arag = await rt.arag.health();
    return Response.json(
      { ok: arag.ok, mock: rt.env.arag.mock, arag: { ok: arag.ok, ms: arag.ms, resources: arag.resources } },
      { status: arag.ok ? 200 : 503 },
    );
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 503 });
  }
}
