import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

// POST /api/share/[token]/view — record progress/analytics from player
const viewUpdateSchema = z.object({
  viewId: z.string(),
  stepsViewed: z.number().optional(),
  duration: z.number().optional(),
  completed: z.boolean().optional(),
  viewerEmail: z.string().email().optional().nullable(),
  viewerCompany: z.string().optional().nullable(),
});

export async function POST(
  req: Request,
  { params }: { params: { token: string } }
) {
  const demo = await prisma.demo.findFirst({
    where: { shareToken: params.token, isPublished: true },
  });
  if (!demo) {
    return NextResponse.json({ error: "Demo not found" }, { status: 404 });
  }

  try {
    const body = viewUpdateSchema.parse(await req.json());
    const view = await prisma.demoView.update({
      where: { id: body.viewId },
      data: {
        stepsViewed: body.stepsViewed,
        duration: body.duration,
        completed: body.completed,
        viewerEmail: body.viewerEmail,
        viewerCompany: body.viewerCompany,
      },
    });
    return NextResponse.json({ success: true, view });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update view" }, { status: 500 });
  }
}
