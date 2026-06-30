import { NextRequest, NextResponse } from "next/server";
import { listCalls } from "@/lib/calls";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const q = sp.get("q") ?? undefined;
  // filters arrive as repeated `label=labelset/label`
  const labels = sp.getAll("label");
  try {
    const calls = await listCalls({ query: q, labels });
    return NextResponse.json({ calls });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
