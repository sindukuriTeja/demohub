import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const demo = await prisma.demo.findFirst({
    where: { id: params.id, workspace: { ownerId: session.user.id } },
  });
  if (!demo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.demo.update({ where: { id: params.id }, data: { status: "ready" } });
  // Close any open recorder session
  await prisma.recorderSession.updateMany({
    where: { demoId: params.id, status: { not: "closed" } },
    data: { status: "closed" },
  });

  return NextResponse.json({ ok: true });
}
