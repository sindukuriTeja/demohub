import { NextResponse } from "next/server";
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

    const formData = await req.formData();
    const stepId = formData.get("stepId") as string;
    const videoFile = formData.get("videoFile") as File | null;

    if (!stepId) return NextResponse.json({ error: "stepId required" }, { status: 400 });
    if (!videoFile) return NextResponse.json({ error: "videoFile required" }, { status: 400 });

    const step = await prisma.demoStep.findFirst({
      where: { id: stepId },
      include: { demo: { include: { workspace: true } } },
    });
    if (!step || step.demo.workspace.ownerId !== userId)
      return NextResponse.json({ error: "Step not found" }, { status: 404 });

    const fs = await import("fs");
    const path = await import("path");
    const dir = path.join(process.cwd(), "public", "avatars", step.demoId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const filename = `${stepId}.webm`;
    fs.writeFileSync(path.join(dir, filename), Buffer.from(await videoFile.arrayBuffer()));
    const videoUrl = `/avatars/${step.demoId}/${filename}`;

    await prisma.demoStep.update({ where: { id: stepId }, data: { avatarVideoUrl: videoUrl, avatarStatus: "done" } });
    return NextResponse.json({ videoUrl });
  } catch (err: any) {
    console.error("avatar/save:", err);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}
