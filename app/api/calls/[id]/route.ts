import { NextRequest, NextResponse } from "next/server";
import { getCall } from "@/lib/calls";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const call = await getCall(id);
    return NextResponse.json(call);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
