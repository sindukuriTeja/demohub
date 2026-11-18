import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/demos/[id]/export/video — export a demo as video
// (Stub — filled in a later milestone.)
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  return NextResponse.json({ ok: true });
}
