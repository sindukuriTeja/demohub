import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/recorder/caption — generate an AI caption for a step
export async function POST(req: Request) {
  const token = req.headers.get("x-recorder-token");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await prisma.recorderSession.findUnique({ where: { token } });
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { stepId, elInfo, screenshotUrl } = await req.json();

  let caption = "";
  let title = "";

  const contextText = elInfo
    ? `Clicked element: ${elInfo.tag} "${elInfo.text || elInfo.ariaLabel || elInfo.placeholder}", Page: "${elInfo.pageTitle}" at ${elInfo.pageUrl}`
    : "Manual screenshot";

  // 1) Anthropic (if configured)
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const { Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const msg = await client.messages.create({
        model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
        max_tokens: 150,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `You write short onboarding captions for product demos. Context: ${contextText}\n\nWrite ONE instruction sentence, max 18 words, imperative voice, naming the clicked element exactly as shown. Example: "Click 'Create Account' to finish signing up."\n\nReturn JSON only: {"caption":"...","title":"..."}`,
              },
            ],
          },
        ],
      });
      const text = msg.content[0].type === "text" ? msg.content[0].text : "";
      const parsed = JSON.parse((text.match(/\{[\s\S]*\}/)?.[0]) || "{}");
      caption = parsed.caption || "";
      title = parsed.title || "";
    } catch (e) {
      // fall through
    }
  }

  // 2) Groq / OpenAI-compatible (OpenAI SDK)
  if (!caption && (process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY)) {
    try {
      const { default: OpenAI } = await import("openai");
      const client = new OpenAI({
        apiKey: process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL || "https://api.groq.com/openai/v1",
      });
      const completion = await client.chat.completions.create({
        model: process.env.AI_MODEL || "llama-3.3-70b-versatile",
        temperature: 0.3,
        max_tokens: 150,
        messages: [
          {
            role: "system",
            content:
              "You write short onboarding captions for product demos. Reply with strict JSON only: {\"caption\":\"...\",\"title\":\"...\"}.",
          },
          {
            role: "user",
            content: `Context: ${contextText}\nWrite ONE instruction sentence (max 18 words, imperative voice) naming the clicked element exactly. Return JSON only.`,
          },
        ],
      });
      const text = completion.choices[0]?.message?.content || "";
      const parsed = JSON.parse((text.match(/\{[\s\S]*\}/)?.[0]) || "{}");
      caption = parsed.caption || "";
      title = parsed.title || "";
    } catch (e) {
      // fall through to rule-based
    }
  }

  // 3) Rule-based fallback
  if (!caption && elInfo) {
    const name = elInfo.text || elInfo.ariaLabel || elInfo.placeholder || elInfo.tag;
    if (elInfo.tag === "input" || elInfo.tag === "textarea") {
      caption = `Type in '${name}' to enter your information.`;
    } else {
      caption = `Click '${name}' to continue.`;
    }
    title = name ? `Click ${name.slice(0, 30)}` : "Click element";
  }

  if (!caption) {
    caption = "Click to continue.";
    title = "Next step";
  }

  // Update step in DB
  await prisma.demoStep
    .update({
      where: { id: stepId },
      data: {
        callout: JSON.stringify({
          text: caption,
          placement: "auto",
          fontFamily: "Inter",
          fontSize: 15,
          textColor: "#FFFFFF",
          bgColor: "#5B3DF5",
          showArrow: true,
        }),
        title: title || undefined,
        aiStatus: "done",
      },
    })
    .catch(() => {});

  // screenshotUrl included to silence unused-var lint
  void screenshotUrl;

  return NextResponse.json({ caption, title });
}
