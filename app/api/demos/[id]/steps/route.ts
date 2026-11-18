import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const stepSchema = z.object({
  order: z.number(),
  title: z.string().optional(),
  description: z.string().optional(),
  snapshot: z.string().optional(), // JSON string
  hotspots: z.string(), // JSON array string
  videoUrl: z.string().optional(),
  duration: z.number().optional(),
  // New Supademo-style recorder / editor fields
  type: z.string().optional(),
  pageUrl: z.string().optional(),
  pageTitle: z.string().optional(),
  clickX: z.number().optional(),
  clickY: z.number().optional(),
  elementJson: z.string().optional(),
  callout: z.string().optional(),
  hotspot: z.string().optional(),
  blurs: z.string().optional(),
  annotations: z.string().optional(),
  crop: z.string().optional(),
  background: z.string().optional(),
  aiStatus: z.string().optional(),
  screenshotUrl: z.string().optional(),
});

// POST /api/demos/[id]/steps — add/update a step
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const demo = await prisma.demo.findFirst({
    where: { id: params.id, workspace: { ownerId: session.user.id } },
  });
  if (!demo) {
    return NextResponse.json({ error: "Demo not found" }, { status: 404 });
  }

  try {
    const body = stepSchema.parse(await req.json());

    // Find existing step at this order position to avoid duplicates
    const existing = await prisma.demoStep.findFirst({
      where: { demoId: params.id, order: body.order },
    });

    let step;
    if (existing) {
      step = await prisma.demoStep.update({
        where: { id: existing.id },
        data: {
          title: body.title,
          description: body.description,
          snapshot: body.snapshot,
          hotspots: body.hotspots,
          videoUrl: body.videoUrl,
          duration: body.duration,
          type: body.type,
          pageUrl: body.pageUrl,
          pageTitle: body.pageTitle,
          clickX: body.clickX,
          clickY: body.clickY,
          elementJson: body.elementJson,
          callout: body.callout,
          hotspot: body.hotspot,
          blurs: body.blurs,
          annotations: body.annotations,
          crop: body.crop,
          background: body.background,
          aiStatus: body.aiStatus,
          screenshotUrl: body.screenshotUrl,
        },
      });
    } else {
      step = await prisma.demoStep.create({
        data: {
          demoId: params.id,
          order: body.order,
          title: body.title,
          description: body.description,
          snapshot: body.snapshot,
          hotspots: body.hotspots,
          videoUrl: body.videoUrl,
          duration: body.duration,
          type: body.type,
          pageUrl: body.pageUrl,
          pageTitle: body.pageTitle,
          clickX: body.clickX,
          clickY: body.clickY,
          elementJson: body.elementJson,
          callout: body.callout,
          hotspot: body.hotspot,
          blurs: body.blurs,
          annotations: body.annotations,
          crop: body.crop,
          background: body.background,
          aiStatus: body.aiStatus,
          screenshotUrl: body.screenshotUrl,
        },
      });
    }
    return NextResponse.json(step);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to add step" }, { status: 500 });
  }
}

// PUT /api/demos/[id]/steps — bulk save all steps (used by recorder)
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const demo = await prisma.demo.findFirst({
    where: { id: params.id, workspace: { ownerId: session.user.id } },
  });
  if (!demo) {
    return NextResponse.json({ error: "Demo not found" }, { status: 404 });
  }

  try {
    const { steps } = await req.json();
    if (!Array.isArray(steps)) {
      return NextResponse.json({ error: "steps must be an array" }, { status: 400 });
    }

    // Delete existing steps and recreate
    await prisma.demoStep.deleteMany({ where: { demoId: params.id } });

    const created = await prisma.demoStep.createMany({
      data: steps.map((s: any, i: number) => ({
        demoId: params.id,
        order: s.order ?? i,
        title: s.title,
        description: s.description,
        snapshot: s.snapshot,
        hotspots: typeof s.hotspots === "string" ? s.hotspots : JSON.stringify(s.hotspots || []),
        videoUrl: s.videoUrl,
        duration: s.duration,
        // New Supademo-style recorder / editor fields
        type: s.type ?? "click",
        pageUrl: s.pageUrl,
        pageTitle: s.pageTitle,
        clickX: s.clickX,
        clickY: s.clickY,
        elementJson: s.elementJson,
        callout: s.callout,
        hotspot: s.hotspot,
        blurs: s.blurs,
        annotations: s.annotations,
        crop: s.crop,
        background: s.background,
        aiStatus: s.aiStatus ?? "pending",
        screenshotUrl: s.screenshotUrl,
      })),
    });

    return NextResponse.json({ count: created.count });
  } catch (error: any) {
    return NextResponse.json({ error: "Failed to save steps" }, { status: 500 });
  }
}
