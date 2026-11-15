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
    const step = await prisma.demoStep.create({
      data: {
        demoId: params.id,
        order: body.order,
        title: body.title,
        description: body.description,
        snapshot: body.snapshot,
        hotspots: body.hotspots,
        videoUrl: body.videoUrl,
        duration: body.duration,
      },
    });
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
      })),
    });

    return NextResponse.json({ count: created.count });
  } catch (error: any) {
    return NextResponse.json({ error: "Failed to save steps" }, { status: 500 });
  }
}
