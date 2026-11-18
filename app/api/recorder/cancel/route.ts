import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/recorder/cancel — discard all recorded steps for a session
export async function POST(req: Request) {
  const token = req.headers.get("x-recorder-token");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const session = await prisma.recorderSession.findUnique({ where: { token } });
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.demoStep.deleteMany({ where: { demoId: session.demoId } });
  await prisma.recorderSession.update({
    where: { id: session.id },
    data: { status: "closed", stepCount: 0 },
  });
  // Reset demo status back to draft
  await prisma.demo.update({ where: { id: session.demoId }, data: { status: "draft" } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
