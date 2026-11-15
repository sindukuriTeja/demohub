import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/analytics?demoId=... — analytics for a demo or all demos
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const demoId = searchParams.get("demoId");

  const where = demoId
    ? { demo: { id: demoId, workspace: { ownerId: session.user.id } } }
    : { demo: { workspace: { ownerId: session.user.id } } };

  const views = await prisma.demoView.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { demo: { select: { id: true, title: true } } },
  });

  const totalViews = views.length;
  const completed = views.filter((v) => v.completed).length;
  const uniqueViewers = new Set(
    views.map((v) => v.viewerEmail || v.ipAddress || v.id)
  ).size;
  const avgDuration =
    totalViews > 0
      ? Math.round(views.reduce((a, v) => a + v.duration, 0) / totalViews)
      : 0;
  const avgSteps =
    totalViews > 0
      ? Math.round(views.reduce((a, v) => a + v.stepsViewed, 0) / totalViews)
      : 0;

  // Top demos
  const demoStats = await prisma.demo.findMany({
    where: demoId ? { id: demoId } : { workspace: { ownerId: session.user.id } },
    select: {
      id: true,
      title: true,
      _count: { select: { views: true, leads: true } },
    },
  });

  return NextResponse.json({
    summary: {
      totalViews,
      completed,
      completionRate: totalViews > 0 ? Math.round((completed / totalViews) * 100) : 0,
      uniqueViewers,
      avgDuration,
      avgSteps,
    },
    views,
    demoStats,
  });
}
