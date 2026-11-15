import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateAgentReply } from "@/lib/ai";
import { z } from "zod";

export const dynamic = "force-dynamic";

const chatSchema = z.object({
  message: z.string().min(1),
  sessionId: z.string(),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .optional(),
});

// POST /api/agent/[id]/chat — talk to the AI Demo Agent
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    // Allow public chat if agent is active (for embedded agents)
  }

  const agent = await prisma.demoAgent.findFirst({
    where: { id: params.id },
    include: { demo: { include: { steps: { orderBy: { order: "asc" } } } } },
  });
  if (!agent || !agent.isActive) {
    return NextResponse.json({ error: "Agent not found or inactive" }, { status: 404 });
  }

  try {
    const body = chatSchema.parse(await req.json());

    // Build demo context from steps
    const demoContext = agent.demo.steps
      .map((s) => `[Step ${s.order}] ${s.title || "Step"}: ${s.description || ""}`)
      .join("\n");

    const history: { role: "user" | "assistant"; content: string }[] = (
      body.history || []
    ).slice(-10);

    const { reply, credits } = await generateAgentReply(
      body.message,
      demoContext,
      history as any,
      agent.instructions
    );

    // Save conversation
    await prisma.agentConversation.createMany({
      data: [
        { agentId: agent.id, sessionId: body.sessionId, role: "user", content: body.message },
        { agentId: agent.id, sessionId: body.sessionId, role: "assistant", content: reply, credits },
      ],
    });

    // Update credits used
    if (credits > 0) {
      await prisma.demoAgent.update({
        where: { id: agent.id },
        data: { creditsUsed: { increment: credits } },
      });
    }

    return NextResponse.json({ reply, credits });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: "Chat failed" }, { status: 500 });
  }
}
