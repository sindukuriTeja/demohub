import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

// GET /api/leads?demoId=... — list leads for a demo
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const demoId = searchParams.get("demoId");

  if (demoId) {
    const demo = await prisma.demo.findFirst({
      where: { id: demoId, workspace: { ownerId: session.user.id } },
    });
    if (!demo) {
      return NextResponse.json({ error: "Demo not found" }, { status: 404 });
    }
  }

  const leads = await prisma.lead.findMany({
    where: demoId ? { demoId } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json(leads);
}

// POST /api/leads — capture a lead (public or authenticated)
const leadSchema = z.object({
  demoId: z.string(),
  email: z.string().email(),
  name: z.string().optional(),
  company: z.string().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
  source: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = leadSchema.parse(await req.json());

    const demo = await prisma.demo.findFirst({
      where: { id: body.demoId },
      include: { workspace: true },
    });
    if (!demo) {
      return NextResponse.json({ error: "Demo not found" }, { status: 404 });
    }

    const lead = await prisma.lead.create({
      data: {
        demoId: body.demoId,
        email: body.email,
        name: body.name,
        company: body.company,
        phone: body.phone,
        notes: body.notes,
        source: body.source || "form",
      },
    });

    return NextResponse.json({ success: true, lead });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to capture lead" }, { status: 500 });
  }
}
