import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/recorder/sessions/[id]/file — file chooser upload
// (Stub — filled in a later milestone.)
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  return NextResponse.json({ ok: true });
}
