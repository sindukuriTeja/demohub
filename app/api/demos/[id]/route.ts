import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const updateDemoSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  isPublished: z.boolean().optional(),
  requireEmail: z.boolean().optional(),
  password: z.string().optional().nullable(),
});

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const demo = await prisma.demo.findFirst({
    where: { id: params.id, workspace: { ownerId: session.user.id } },
    include: {
      steps: { orderBy: { order: "asc" } },
      workspace: true,
    },
  });

  if (!demo) {
    return NextResponse.json({ error: "Demo not found" }, { status: 404 });
  }

  return NextResponse.json(demo);
}

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
    const body = updateDemoSchema.parse(await req.json());
    const updated = await prisma.demo.update({
      where: { id: params.id },
      data: body,
    });
    return NextResponse.json(updated);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(
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

  await prisma.demo.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
