import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import * as fs from "fs";
import * as path from "path";

export const dynamic = "force-dynamic";

// GET /api/avatar/status?stepId=xxx
// Polls D-ID for the talk status.
// When done: downloads the MP4, saves to /public/avatars/{demoId}/{stepId}.mp4,
// updates step.avatarVideoUrl + avatarStatus = "done".
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const stepId = searchParams.get("stepId");
  if (!stepId) return NextResponse.json({ error: "stepId required" }, { status: 400 });

  const step = await prisma.demoStep.findFirst({
    where: { id: stepId },
    include: { demo: { include: { workspace: true } } },
  });
  if (!step || step.demo.workspace.ownerId !== (session.user as any).id) {
    return NextResponse.json({ error: "Step not found" }, { status: 404 });
  }

  // Already done
  if (step.avatarStatus === "done" && step.avatarVideoUrl) {
    return NextResponse.json({ status: "done", videoUrl: step.avatarVideoUrl });
  }
  if (step.avatarStatus === "failed") {
    return NextResponse.json({ status: "failed", error: "Avatar generation failed" });
  }
  if (!step.avatarTalkId) {
    return NextResponse.json({ status: step.avatarStatus || "none" });
  }

  const didKey = process.env.DID_API_KEY;
  if (!didKey) return NextResponse.json({ error: "DID_API_KEY not set" }, { status: 503 });

  // Poll D-ID
  let didData: any;
  try {
    const didRes = await fetch(`https://api.d-id.com/talks/${step.avatarTalkId}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(didKey + ":").toString("base64")}`,
        Accept: "application/json",
      },
    });
    didData = await didRes.json();
  } catch (err: any) {
    return NextResponse.json({ error: "D-ID poll failed: " + err.message }, { status: 502 });
  }

  const didStatus = didData?.status; // created | started | done | error

  if (didStatus === "done" && didData?.result_url) {
    // Download the video and save locally
    let videoUrl = `/avatars/${step.demoId}/${stepId}.mp4`;
    try {
      const videoRes = await fetch(didData.result_url);
      if (videoRes.ok) {
        const buf = Buffer.from(await videoRes.arrayBuffer());
        const dir = path.join(process.cwd(), "public", "avatars", step.demoId);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `${stepId}.mp4`), buf);
      } else {
        // Use D-ID URL directly if download fails
        videoUrl = didData.result_url;
      }
    } catch {
      videoUrl = didData.result_url;
    }

    await prisma.demoStep.update({
      where: { id: stepId },
      data: { avatarVideoUrl: videoUrl, avatarStatus: "done" },
    });

    return NextResponse.json({ status: "done", videoUrl });
  }

  if (didStatus === "error") {
    await prisma.demoStep.update({
      where: { id: stepId },
      data: { avatarStatus: "failed" },
    });
    return NextResponse.json({ status: "failed", error: didData?.error?.description || "D-ID error" });
  }

  // Still processing (created | started)
  return NextResponse.json({ status: "generating", didStatus });
}
