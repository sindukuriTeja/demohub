import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/share/[token] — public access to a published demo
export async function GET(
  req: Request,
  { params }: { params: { token: string } }
) {
  const demo = await prisma.demo.findFirst({
    where: { shareToken: params.token, isPublished: true },
    include: {
      steps: { orderBy: { order: "asc" } },
    },
  });

  if (!demo) {
    return NextResponse.json({ error: "Demo not found or not published" }, { status: 404 });
  }

  // Password check
  if (demo.password) {
    const { password } = await req.json().catch(() => ({}));
    if (password !== demo.password) {
      return NextResponse.json({ error: "Password required", requiresPassword: true }, { status: 403 });
    }
  }

  // Record a view
  const ua = req.headers.get("user-agent") || "";
  const view = await prisma.demoView.create({
    data: {
      demoId: demo.id,
      viewerEmail: null,
      userAgent: ua,
    },
  });

  return NextResponse.json({
    demo: {
      id: demo.id,
      title: demo.title,
      description: demo.description,
      type: demo.type,
      requireEmail: demo.requireEmail,
    },
    viewId: view.id,
    steps: demo.steps,
  });
}
