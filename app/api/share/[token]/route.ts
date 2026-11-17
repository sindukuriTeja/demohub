import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { z } from "zod";

export const dynamic = "force-dynamic";

const passwordSchema = z.object({
  password: z.string().optional(),
});

// Shared handler for GET (no password) and POST (with password)
async function handleShare(req: Request, params: { token: string }) {
  // Check if the requesting user is the owner (for preview of unpublished demos)
  const session = await auth();

  const demo = await prisma.demo.findFirst({
    where: { shareToken: params.token },
    include: {
      steps: { orderBy: { order: "asc" } },
      agent: { select: { id: true, isActive: true } },
      workspace: { select: { ownerId: true } },
    },
  });

  if (!demo) {
    return NextResponse.json({ error: "Demo not found" }, { status: 404 });
  }

  // Allow owner to preview unpublished demos; block everyone else
  const isOwner = session?.user?.id && demo.workspace.ownerId === session.user.id;
  if (!demo.isPublished && !isOwner) {
    return NextResponse.json({ error: "Demo not found or not published" }, { status: 404 });
  }

  // Password check (skip for owner previewing their own demo)
  if (demo.password && !isOwner) {
    const body = await req.json().catch(() => ({}));
    const parsed = passwordSchema.safeParse(body);
    const provided = parsed.success ? parsed.data.password : undefined;
    if (provided !== demo.password) {
      return NextResponse.json({ error: "Password required", requiresPassword: true }, { status: 403 });
    }
  }

  // Record a view (only for public viewers, not owner previews)
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
      isPublished: demo.isPublished,
    },
    agentId: demo.agent?.isActive ? demo.agent.id : null,
    viewId: view.id,
    steps: demo.steps,
    isPreview: !demo.isPublished && isOwner,
  });
}

// GET /api/share/[token] — public access to a published demo (no password)
export async function GET(
  _req: Request,
  { params }: { params: { token: string } }
) {
  return handleShare(_req, params);
}

// POST /api/share/[token] — same as GET but accepts password in body
export async function POST(
  req: Request,
  { params }: { params: { token: string } }
) {
  return handleShare(req, params);
}
