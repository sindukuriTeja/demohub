import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

// GET /api/demos — list user's demos
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const demos = await prisma.demo.findMany({
    where: { workspace: { ownerId: session.user.id } },
    include: {
      _count: { select: { steps: true, views: true, leads: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(demos);
}

// POST /api/demos — create a demo
const createDemoSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  type: z.enum(["interactive", "video", "sandbox", "mobile"]).optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspace = await prisma.workspace.findUnique({
    where: { ownerId: session.user.id },
  });
  if (!workspace) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  try {
    const body = createDemoSchema.parse(await req.json());
    const demo = await prisma.demo.create({
      data: {
        workspaceId: workspace.id,
        title: body.title,
        description: body.description,
        type: body.type || "interactive",
        shareToken: Math.random().toString(36).substring(2, 15),
      },
    });
    return NextResponse.json(demo);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create demo" }, { status: 500 });
  }
}
