import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// DELETE /api/recorder/sessions/[id] — close a recorder session
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rec = await prisma.recorderSession.findUnique({ where: { id: params.id } });
  if (!rec) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (rec.userId !== session.user.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Ask the recorder server to close the browser
  try {
    const recorderPort = process.env.RECORDER_PORT || "3001";
    await fetch(`http://localhost:${recorderPort}/close-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: params.id }),
    });
  } catch {}

  // Mark the demo ready if it has steps, else back to draft
  const stepCount = await prisma.demoStep.count({ where: { demoId: rec.demoId } });
  await prisma.demo
    .update({ where: { id: rec.demoId }, data: { status: stepCount > 0 ? "ready" : "draft" } })
    .catch(() => {});

  await prisma.recorderSession.update({
    where: { id: params.id },
    data: { status: "closed" },
  });

  return NextResponse.json({ ok: true });
}
