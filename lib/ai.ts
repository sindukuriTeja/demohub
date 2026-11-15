import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface AgentMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Generate a reply for the AI Demo Agent.
 * The agent is grounded in the demo content passed in.
 */
export async function generateAgentReply(
  userMessage: string,
  demoContext: string,
  conversationHistory: AgentMessage[] = [],
  instructions: string | null = null
): Promise<{ reply: string; credits: number }> {
  if (!process.env.OPENAI_API_KEY) {
    return {
      reply:
        "AI Demo Agent is not configured (missing OPENAI_API_KEY). Add it to .env to enable.",
      credits: 0,
    };
  }

  const systemPrompt = instructions
    ? instructions
    : `You are a product demo assistant. You help buyers understand the product by answering questions and pointing them to relevant parts of the demo. Be concise, helpful, and friendly. Only use information from the demo content provided. If you don't know, say so and suggest they continue the demo.`;

  const messages: AgentMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "system",
      content: `Demo content context:\n${demoContext}`,
    },
    ...conversationHistory.slice(-10), // keep last 10 messages for context
    { role: "user", content: userMessage },
  ];

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: messages as any,
    temperature: 0.3,
    max_tokens: 500,
  });

  const reply = completion.choices[0]?.message?.content || "Sorry, I couldn't generate a response.";
  return { reply, credits: 1 };
}
