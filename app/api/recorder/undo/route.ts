import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/recorder/undo — remove the last recorded step
export async function POST(req: Request) {
  const token = req.headers.get("x-recorder-token");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const session = await prisma.recorderSession.findUnique({ where: { token } });
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const lastStep = await prisma.demoStep.findFirst({
    where: { demoId: session.demoId },
    orderBy: { order: "desc" },
  });
  if (lastStep) {
    await prisma.demoStep.delete({ where: { id: lastStep.id } });
    await prisma.recorderSession.update({
      where: { id: session.id },
      data: { stepCount: { decrement: 1 } },
    });
  }
  return NextResponse.json({ ok: true });
}
