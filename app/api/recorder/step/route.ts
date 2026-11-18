import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/recorder/step — save a step from the recorder server
export async function POST(req: Request) {
  const token = req.headers.get("x-recorder-token");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await prisma.recorderSession.findUnique({ where: { token } });
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const body = await req.json();

  try {
    const step = await prisma.demoStep.create({
      data: {
        id: body.stepId,
        demoId: session.demoId,
        order: body.order ?? 0,
        type: body.type ?? "click",
        title: body.title,
        description: body.description || "",
        snapshot: body.snapshot || "",
        hotspots: body.hotspots || "[]",
        screenshotUrl: body.screenshotUrl,
        elementJson: body.elementJson,
        callout: body.callout,
        hotspot: body.hotspot,
        clickX: body.clickX,
        clickY: body.clickY,
        pageUrl: body.pageUrl,
        pageTitle: body.pageTitle,
        aiStatus: body.aiStatus ?? "pending",
      },
    });

    await prisma.recorderSession.update({
      where: { id: session.id },
      data: { stepCount: { increment: 1 }, updatedAt: new Date() },
    });

    return NextResponse.json(step);
  } catch (e: any) {
    // The stepId may collide on undo/retry; fall back to a new id create
    return NextResponse.json({ error: "Failed to save step: " + e.message }, { status: 500 });
  }
}
