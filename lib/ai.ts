import OpenAI from "openai";

// ─── Provider configuration ─────────────────────────────────────────────────
// Supports Groq (free, recommended) and OpenAI (paid). Both use the same SDK.
// Groq is OpenAI-compatible, so we just point the SDK at Groq's endpoint.
const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
const baseURL = process.env.OPENAI_BASE_URL || "https://api.groq.com/openai/v1";

const client = apiKey ? new OpenAI({ apiKey, baseURL }) : null;

// Default model — Groq free tier: llama-3.3-70b-versatile (fast, powerful)
// OpenAI alternative: gpt-4o-mini
const MODEL = process.env.AI_MODEL || "llama-3.3-70b-versatile";

export interface AgentMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Generate a reply for the AI Demo Agent.
 * The agent is grounded in the demo content passed in.
 * Uses Groq by default (free, no credit card) or OpenAI if OPENAI_API_KEY is set.
 */
export async function generateAgentReply(
  userMessage: string,
  demoContext: string,
  conversationHistory: AgentMessage[] = [],
  instructions: string | null = null
): Promise<{ reply: string; credits: number }> {
  if (!client) {
    return {
      reply:
        "AI Demo Agent is not configured. Add GROQ_API_KEY (free, no credit card) or OPENAI_API_KEY to .env to enable.",
      credits: 0,
    };
  }

  const systemPrompt =
    instructions ||
    `You are a product demo assistant. You help buyers understand the product by answering questions and pointing them to relevant parts of the demo. Be concise, helpful, and friendly. Only use information from the demo content provided. If you don't know, say so and suggest they continue the demo.`;

  const messages: AgentMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "system",
      content: `Demo content context:\n${demoContext}`,
    },
    ...conversationHistory.slice(-10), // keep last 10 messages for context
    { role: "user", content: userMessage },
  ];

  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: messages as any,
    temperature: 0.3,
    max_tokens: 500,
  });

  const reply = completion.choices[0]?.message?.content || "Sorry, I couldn't generate a response.";
  return { reply, credits: 1 };
}
