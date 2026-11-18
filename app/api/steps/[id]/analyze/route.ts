import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const step = await prisma.demoStep.findFirst({
    where: { id: params.id },
    include: { demo: { include: { workspace: true } } },
  });
  if (!step || step.demo.workspace.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { mode } = await req.json().catch(() => ({}));
  const elInfo = step.elementJson ? JSON.parse(step.elementJson) : null;
  const existingCallout = step.callout ? JSON.parse(step.callout) : null;
  const existingCaption = existingCallout?.text || "";

  let caption = "";
  let title = "";

  // Try AI
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const { Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      let prompt = "";
      if (mode === "Make friendlier") {
        prompt = `Rewrite this demo caption in a friendlier tone (max 18 words): "${existingCaption}". Return JSON: {"caption":"...","title":"..."}`;
      } else if (mode === "Make shorter") {
        prompt = `Shorten this demo caption to max 10 words: "${existingCaption}". Return JSON: {"caption":"...","title":"..."}`;
      } else if (mode?.startsWith("Translate")) {
        const lang = mode.replace("Translate to ", "");
        prompt = `Translate this demo caption to ${lang}: "${existingCaption}". Return JSON: {"caption":"...","title":"..."}`;
      } else {
        const ctx = elInfo ? `Element: ${elInfo.tag} "${elInfo.text || elInfo.ariaLabel || ""}", Page: "${elInfo.pageTitle}"` : `Step: "${step.title}"`;
        prompt = `Write a short onboarding caption (max 18 words, imperative voice) for: ${ctx}. Return JSON: {"caption":"...","title":"..."}`;
      }

      const msg = await client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 150,
        messages: [{ role: "user", content: prompt }],
      });

      const text = msg.content[0].type === "text" ? msg.content[0].text : "";
      const parsed = JSON.parse(text.match(/\{.*\}/s)?.[0] || "{}");
      caption = parsed.caption || "";
      title = parsed.title || "";
    } catch {}
  }

  // Fallback
  if (!caption) {
    if (elInfo) {
      const name = elInfo.text || elInfo.ariaLabel || elInfo.placeholder || elInfo.tag;
      caption = elInfo.tag === "input" ? `Type in '${name}' to enter your information.` : `Click '${name}' to continue.`;
      title = `Click ${(name || "").slice(0, 30)}`;
    } else {
      caption = existingCaption || "Click to continue.";
      title = step.title || "Step";
    }
  }

  // Update DB
  if (caption) {
    const updatedCallout = { ...(existingCallout || {}), text: caption };
    await prisma.demoStep.update({
      where: { id: params.id },
      data: { callout: JSON.stringify(updatedCallout), title: title || undefined, aiStatus: "done" },
    });
  }

  return NextResponse.json({ caption, title });
}
