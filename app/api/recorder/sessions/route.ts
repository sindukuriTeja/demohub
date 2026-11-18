import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import * as crypto from "crypto";

export const dynamic = "force-dynamic";

// POST /api/recorder/sessions — create a recorder session
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { demoId, url, viewport = "1280x720", insertAfter, rememberLogin } = await req.json();

  if (!demoId || !url) return NextResponse.json({ error: "demoId and url required" }, { status: 400 });

  // Validate the demo belongs to the user
  const demo = await prisma.demo.findFirst({
    where: { id: demoId, workspace: { ownerId: session.user.id } },
  });
  if (!demo) return NextResponse.json({ error: "Demo not found" }, { status: 404 });

  // Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url.startsWith("http") ? url : `https://${url}`);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error("Invalid protocol");
  } catch {
    return NextResponse.json({ error: "Enter a valid website address" }, { status: 400 });
  }

  // Check existing active session for this demo
  const existing = await prisma.recorderSession.findUnique({ where: { demoId } });
  if (existing && existing.status !== "closed") {
    return NextResponse.json({ error: "This demo is already being recorded" }, { status: 409 });
  }

  const id = crypto.randomBytes(8).toString("hex");
  const token = crypto.randomBytes(32).toString("hex");

  await prisma.recorderSession.upsert({
    where: { demoId },
    create: {
      id,
      demoId,
      userId: session.user.id,
      status: "starting",
      url: parsedUrl.href,
      viewport,
      token,
      stepCount: 0,
    },
    update: {
      id,
      userId: session.user.id,
      status: "starting",
      url: parsedUrl.href,
      viewport,
      token,
      stepCount: 0,
    },
  });

  // Update demo status
  await prisma.demo.update({ where: { id: demoId }, data: { status: "recording" } });

  // Launch Playwright session via the recorder server
  try {
    const recorderPort = process.env.RECORDER_PORT || "3001";
    const res = await fetch(`http://localhost:${recorderPort}/create-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        demoId,
        userId: session.user.id,
        url: parsedUrl.href,
        viewport,
        token,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error("Recorder server error: " + errText);
    }
  } catch (e: any) {
    await prisma.recorderSession.update({ where: { id }, data: { status: "closed" } });
    await prisma.demo.update({ where: { id: demoId }, data: { status: "draft" } }).catch(() => {});
    return NextResponse.json(
      { error: "Recorder service not available. Run: npm run dev:recorder" },
      { status: 503 }
    );
  }

  // Mark session recording now that the browser is up
  await prisma.recorderSession.update({ where: { id }, data: { status: "recording" } });

  const wsUrl = `ws://localhost:${process.env.RECORDER_PORT || 3001}/${id}`;
  // insertAfter / rememberLogin are accepted for forward-compat
  void insertAfter;
  void rememberLogin;
  return NextResponse.json({ sessionId: id, wsUrl, token });
}
