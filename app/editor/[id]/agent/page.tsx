"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AgentPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [demo, setDemo] = useState<any>(null);
  const [agent, setAgent] = useState<any>(null);
  const [instructions, setInstructions] = useState("");
  const [saving, setSaving] = useState(false);
  const [testMsg, setTestMsg] = useState("");
  const [testReply, setTestReply] = useState("");
  const [testLoading, setTestLoading] = useState(false);
  const [sessionId] = useState(() => Math.random().toString(36).slice(2));

  useEffect(() => {
    fetch(`/api/demos/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setDemo(d);
        if (d.agent) {
          setAgent(d.agent);
          setInstructions(d.agent.instructions || "");
        }
      });
  }, [id]);

  async function saveAgent() {
    setSaving(true);
    // Create or update agent
    const res = await fetch(`/api/demos/${id}/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instructions, isActive: true }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) {
      setAgent(data.agent);
      alert("Agent saved");
    } else {
      alert(data.error || "Failed to save");
    }
  }

  async function testAgent() {
    if (!testMsg.trim() || !agent) return;
    setTestLoading(true);
    setTestReply("");
    const res = await fetch(`/api/agent/${agent.id}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: testMsg, sessionId }),
    });
    const data = await res.json();
    setTestLoading(false);
    setTestReply(data.reply || data.error || "No reply");
  }

  async function toggleAgent() {
    if (!agent) return;
    const updated = { ...agent, isActive: !agent.isActive };
    await fetch(`/api/demos/${id}/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instructions, isActive: updated.isActive }),
    });
    setAgent(updated);
  }

  if (!demo) return <div className="p-8">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <button className="text-slate-500" onClick={() => router.push(`/demo/${id}`)}>← Back</button>
          <h1 className="text-xl font-bold">AI Demo Agent</h1>
          {agent && (
            <span className={`text-xs px-2 py-1 rounded-full ${agent.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}`}>
              {agent.isActive ? "Active" : "Inactive"}
            </span>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Agent Instructions</h2>
          <p className="text-sm text-slate-600 mb-3">
            Set the system prompt that guides how the agent answers questions. It stays grounded in your demo content.
          </p>
          <textarea
            className="input"
            rows={8}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="You are a helpful product demo assistant. Answer questions concisely and point buyers to relevant demo steps. Do not make up pricing or features not in the demo."
          />
          <div className="flex gap-3 mt-4">
            <button className="btn-primary" onClick={saveAgent} disabled={saving}>
              {saving ? "Saving..." : "Save Agent"}
            </button>
            {agent && (
              <button className="btn-secondary" onClick={toggleAgent}>
                {agent.isActive ? "Deactivate" : "Activate"}
              </button>
            )}
          </div>
        </div>

        {agent && (
          <div className="card">
            <h2 className="text-lg font-semibold mb-2">Test the Agent</h2>
            <p className="text-sm text-slate-500 mb-4">Try a question before sharing the demo.</p>
            <div className="flex gap-2 mb-4">
              <input
                className="input flex-1"
                placeholder="Ask: What does this product do?"
                value={testMsg}
                onChange={(e) => setTestMsg(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && testAgent()}
              />
              <button className="btn-primary" onClick={testAgent} disabled={testLoading}>
                {testLoading ? "..." : "Test"}
              </button>
            </div>
            {testReply && (
              <div className="bg-slate-50 rounded-lg p-4 text-sm">
                <p className="text-slate-500 text-xs mb-1">Agent reply:</p>
                {testReply}
              </div>
            )}
            <p className="text-xs text-slate-500 mt-3">Credits used: {agent?.creditsUsed || 0}</p>
          </div>
        )}

        <div className="card bg-amber-50 border-amber-200">
          <h3 className="font-semibold text-amber-800 mb-2">AI Demo Agent requires OpenAI API key</h3>
          <p className="text-sm text-amber-700">
            Add <code>OPENAI_API_KEY</code> to your <code>.env</code> file to enable the agent. Without it, the agent returns a fallback message.
          </p>
        </div>
      </main>
    </div>
  );
}
