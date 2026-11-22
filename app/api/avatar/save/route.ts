import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import * as fs from "fs";
import * as path from "path";

export const dynamic = "force-dynamic";

// POST /api/avatar/save
// Body: multipart — stepId (string), videoFile (video/webm blob)
// Saves the client-rendered avatar video and updates the step record.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const stepId = formData.get("stepId") as string;
  const videoFile = formData.get("videoFile") as File | null;

  if (!stepId) return NextResponse.json({ error: "stepId required" }, { status: 400 });
  if (!videoFile) return NextResponse.json({ error: "videoFile required" }, { status: 400 });

  const step = await prisma.demoStep.findFirst({
    where: { id: stepId },
    include: { demo: { include: { workspace: true } } },
  });
  if (!step || step.demo.workspace.ownerId !== (session.user as any).id) {
    return NextResponse.json({ error: "Step not found" }, { status: 404 });
  }

  // Save video file
  const dir = path.join(process.cwd(), "public", "avatars", step.demoId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filename = `${stepId}.webm`;
  const filepath = path.join(dir, filename);
  const buf = Buffer.from(await videoFile.arrayBuffer());
  fs.writeFileSync(filepath, buf);

  const videoUrl = `/avatars/${step.demoId}/${filename}`;

  await prisma.demoStep.update({
    where: { id: stepId },
    data: { avatarVideoUrl: videoUrl, avatarStatus: "done" },
  });

  return NextResponse.json({ videoUrl });
}
