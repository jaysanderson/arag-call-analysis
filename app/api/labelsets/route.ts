import { NextResponse } from "next/server";
import { getLabelsets } from "@/lib/arag";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { labelsets } = await getLabelsets();
    return NextResponse.json({ labelsets });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
