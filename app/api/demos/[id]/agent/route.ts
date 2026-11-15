import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const agentSchema = z.object({
  instructions: z.string().optional(),
  isActive: z.boolean().optional(),
});

// POST /api/demos/[id]/agent — create or update the AI Demo Agent for a demo
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
    const body = agentSchema.parse(await req.json());

    let agent = await prisma.demoAgent.findUnique({
      where: { demoId: params.id },
    });

    if (agent) {
      agent = await prisma.demoAgent.update({
        where: { demoId: params.id },
        data: {
          instructions: body.instructions ?? agent.instructions,
          isActive: body.isActive ?? agent.isActive,
        },
      });
    } else {
      agent = await prisma.demoAgent.create({
        data: {
          workspaceId: demo.workspaceId,
          demoId: params.id,
          instructions: body.instructions,
          isActive: body.isActive ?? true,
        },
      });
    }

    return NextResponse.json({ agent });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to save agent" }, { status: 500 });
  }
}
