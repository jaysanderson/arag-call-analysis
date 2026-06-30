import { NextResponse } from "next/server";
import { dashboard } from "@/lib/calls";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await dashboard());
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
