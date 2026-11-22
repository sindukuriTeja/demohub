import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id as string;

    const { stepId } = await req.json();
    if (!stepId) return NextResponse.json({ error: "stepId required" }, { status: 400 });

    const step = await prisma.demoStep.findFirst({
      where: { id: stepId },
      include: { demo: { include: { workspace: true } } },
    });
    if (!step || step.demo.workspace.ownerId !== userId)
      return NextResponse.json({ error: "Step not found" }, { status: 404 });

    if (!step.voiceAudioUrl)
      return NextResponse.json({ error: "Generate voice audio first (Voiceover tab)" }, { status: 400 });

    await prisma.demoStep.update({ where: { id: stepId }, data: { avatarStatus: "generating" } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("avatar/generate:", err);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}
