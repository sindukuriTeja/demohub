import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;

    const step = await prisma.demoStep.findFirst({
      where: { id: params.id },
      include: { demo: { include: { workspace: true } } },
    });
    if (!step || step.demo.workspace.ownerId !== userId)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { mode } = await req.json().catch(() => ({}));
    const elInfo = step.elementJson ? JSON.parse(step.elementJson) : null;
    const existingCallout = step.callout ? JSON.parse(step.callout) : null;
    const existingCaption = existingCallout?.text || "";

    let caption = "", title = "";

    // Try Groq (available in this project)
    if (process.env.GROQ_API_KEY) {
      try {
        const { default: OpenAI } = await import("openai");
        const client = new OpenAI({
          apiKey: process.env.GROQ_API_KEY,
          baseURL: process.env.OPENAI_BASE_URL || "https://api.groq.com/openai/v1",
        });

        let prompt = "";
        if (mode === "Make friendlier") {
          prompt = `Rewrite friendlier (max 18 words): "${existingCaption}". Return JSON: {"caption":"...","title":"..."}`;
        } else if (mode === "Make shorter") {
          prompt = `Shorten to max 10 words: "${existingCaption}". Return JSON: {"caption":"...","title":"..."}`;
        } else if (mode?.startsWith("Translate")) {
          const lang = mode.replace("Translate to ", "");
          prompt = `Translate to ${lang}: "${existingCaption}". Return JSON: {"caption":"...","title":"..."}`;
        } else {
          const ctx = elInfo
            ? `Element: ${elInfo.tag} "${elInfo.text || elInfo.ariaLabel || ""}", Page: "${elInfo.pageTitle}"`
            : `Step: "${step.title}"`;
          prompt = `Write a short onboarding caption (max 18 words, imperative voice) for: ${ctx}. Return JSON: {"caption":"...","title":"..."}`;
        }

        const completion = await client.chat.completions.create({
          model: process.env.AI_MODEL || "llama-3.3-70b-versatile",
          max_tokens: 150,
          messages: [
            { role: "system", content: "Reply with strict JSON only: {\"caption\":\"...\",\"title\":\"...\"}." },
            { role: "user", content: prompt },
          ],
        });
        const text = completion.choices[0]?.message?.content || "";
        const match = text.match(/\{[\s\S]*\}/);
        const parsed = match ? JSON.parse(match[0]) : {};
        caption = parsed.caption || "";
        title = parsed.title || "";
      } catch {}
    }

    // Rule-based fallback
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

    if (caption) {
      const updatedCallout = { ...(existingCallout || {}), text: caption };
      await prisma.demoStep.update({
        where: { id: params.id },
        data: { callout: JSON.stringify(updatedCallout), title: title || undefined, aiStatus: "done" },
      });
    }

    return NextResponse.json({ caption, title });
  } catch (err: any) {
    console.error("steps/analyze:", err);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}
