import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/avatar/generate
// Body JSON: { stepId }
// This route is a lightweight trigger — the actual video is built client-side
// in the browser using MediaRecorder (screenshot canvas + ElevenLabs audio stream).
// It just marks the step as "generating" so the UI can show the right state.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { stepId } = await req.json();
  if (!stepId) return NextResponse.json({ error: "stepId required" }, { status: 400 });

  const step = await prisma.demoStep.findFirst({
    where: { id: stepId },
    include: { demo: { include: { workspace: true } } },
  });
  if (!step || step.demo.workspace.ownerId !== (session.user as any).id) {
    return NextResponse.json({ error: "Step not found" }, { status: 404 });
  }

  if (!step.voiceAudioUrl) {
    return NextResponse.json({ error: "Generate voice audio first (Voiceover tab)" }, { status: 400 });
  }

  await prisma.demoStep.update({
    where: { id: stepId },
    data: { avatarStatus: "generating" },
  });

  return NextResponse.json({ ok: true, message: "ready_for_client_render" });
}
