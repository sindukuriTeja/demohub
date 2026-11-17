"use client";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";

interface Hotspot {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
}

interface Step {
  id: string;
  order: number;
  title: string | null;
  description: string | null;
  snapshot: string | null;
  hotspots: string;
  videoUrl: string | null;
  duration: number | null;
}

interface Demo {
  id: string;
  title: string;
  description: string | null;
  type: string;
  requireEmail: boolean;
}

export default function PublicPlayerPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [demo, setDemo] = useState<Demo | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [viewId, setViewId] = useState("");
  const [agentId, setAgentId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [showAgent, setShowAgent] = useState(false);
  const [agentMessages, setAgentMessages] = useState<{ role: string; content: string }[]>([]);
  const [agentInput, setAgentInput] = useState("");
  const [agentLoading, setAgentLoading] = useState(false);
  const [sessionId] = useState(() => Math.random().toString(36).slice(2));
  const startTime = useRef(Date.now());
  const viewedSteps = useRef(new Set<number>());

  async function loadDemo(pwd?: string) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/share/${token}`, {
        method: pwd ? "POST" : "GET",
        headers: { "Content-Type": "application/json" },
        body: pwd ? JSON.stringify({ password: pwd }) : undefined,
      });
      const data = await res.json();
      if (res.status === 403 && data.requiresPassword) {
        setRequiresPassword(true);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError(data.error || "Failed to load demo");
        setLoading(false);
        return;
      }
      setDemo(data.demo);
      setSteps(data.steps);
      setViewId(data.viewId);
      setAgentId(data.agentId || null);
      setLoading(false);
    } catch (e) {
      setError("Failed to load demo");
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDemo();
  }, [token]);

  // Record view progress periodically
  useEffect(() => {
    if (!viewId) return;
    const interval = setInterval(() => {
      const duration = Math.round((Date.now() - startTime.current) / 1000);
      fetch(`/api/share/${token}/view`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          viewId,
          stepsViewed: viewedSteps.current.size,
          duration,
          viewerEmail: email || null,
          viewerCompany: company || null,
        }),
      });
    }, 15000);
    return () => clearInterval(interval);
  }, [viewId, token, email, company]);

  // Mark step as viewed
  useEffect(() => {
    if (viewId && steps[currentStep]) {
      viewedSteps.current.add(currentStep);
    }
  }, [currentStep, viewId, steps]);

  function nextStep() {
    if (currentStep < steps.length - 1) setCurrentStep((s) => s + 1);
  }
  function prevStep() {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  }

  async function handleEmailSubmit() {
    if (!email) return;
    await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ demoId: demo!.id, email, company, source: "form" }),
    });
    setShowEmail(false);
  }

  async function askAgent() {
    if (!agentInput.trim()) return;
    if (!agentId) {
      setAgentMessages((m) => [...m, { role: "assistant", content: "AI Agent is not enabled for this demo." }]);
      return;
    }
    const userMsg = agentInput;
    setAgentInput("");
    setAgentMessages((m) => [...m, { role: "user", content: userMsg }]);
    setAgentLoading(true);
    try {
      const res = await fetch(`/api/agent/${agentId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, sessionId, history: agentMessages }),
      });
      const data = await res.json();
      if (res.ok) {
        setAgentMessages((m) => [...m, { role: "assistant", content: data.reply }]);
      } else {
        setAgentMessages((m) => [...m, { role: "assistant", content: "Agent not available: " + (data.error || "") }]);
      }
    } catch (e) {
      setAgentMessages((m) => [...m, { role: "assistant", content: "Failed to reach agent." }]);
    }
    setAgentLoading(false);
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading demo...</div>;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button className="btn-primary" onClick={() => loadDemo()}>Retry</button>
        </div>
      </div>
    );
  }

  if (requiresPassword) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="card w-full max-w-md">
          <h2 className="text-xl font-bold mb-4">This demo is password protected</h2>
          <input
            className="input mb-4"
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadDemo(password)}
          />
          <button className="btn-primary w-full" onClick={() => loadDemo(password)}>Unlock</button>
        </div>
      </div>
    );
  }

  if (!demo) return null;

  const step = steps[currentStep];
  const hotspotList: Hotspot[] = step ? (JSON.parse(step.hotspots || "[]") as Hotspot[]) : [];

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      {/* Header */}
      <div className="bg-slate-800 px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="font-semibold">{demo.title}</h1>
          <p className="text-xs text-slate-400">Step {currentStep + 1} of {steps.length}</p>
        </div>
        <div className="flex items-center gap-3">
          {demo.requireEmail && !email && (
            <button className="btn-secondary text-xs" onClick={() => setShowEmail(true)}>Unlock full access</button>
          )}
          <button
            className={`btn-secondary text-xs ${showAgent ? "bg-brand-600 border-brand-600" : ""}`}
            onClick={() => setShowAgent((s) => !s)}
          >
            🤖 AI Agent
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Demo area */}
        <div className="flex-1 relative">
          {step?.videoUrl ? (
            <video src={step.videoUrl} controls className="w-full h-full object-contain bg-black" />
          ) : (
            <div
              className="w-full h-full relative bg-white"
              dangerouslySetInnerHTML={{ __html: step?.snapshot || "<div class='p-8 text-slate-400'>Empty step</div>" }}
            >
              {/* Hotspots overlay */}
              {hotspotList.map((hs) => (
                <button
                  key={hs.id}
                  className="absolute rounded-full bg-brand-500/80 hover:bg-brand-500 border-2 border-white animate-pulse"
                  style={{
                    left: `${hs.x}%`,
                    top: `${hs.y}%`,
                    width: `${hs.width}%`,
                    height: `${hs.height}%`,
                    transform: "translate(-50%, -50%)",
                  }}
                  onClick={nextStep}
                  title={hs.label}
                >
                  <span className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                    {hs.label || "Next →"}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Step title/description overlay */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-900/90 to-transparent p-6">
            {step?.title && <h2 className="text-xl font-semibold mb-1">{step.title}</h2>}
            {step?.description && <p className="text-slate-300 text-sm">{step.description}</p>}
          </div>
        </div>

        {/* AI Agent panel */}
        {showAgent && (
          <div className="w-96 bg-slate-800 border-l border-slate-700 flex flex-col">
            <div className="p-4 border-b border-slate-700">
              <h3 className="font-semibold">AI Demo Agent</h3>
              <p className="text-xs text-slate-400">Ask questions about the product</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {agentMessages.length === 0 && (
                <p className="text-slate-400 text-sm">Hi! Ask me anything about this product.</p>
              )}
              {agentMessages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-lg p-3 text-sm ${m.role === "user" ? "bg-brand-600" : "bg-slate-700"}`}>
                    {m.content}
                  </div>
                </div>
              ))}
              {agentLoading && <p className="text-slate-400 text-sm">Thinking...</p>}
            </div>
            <div className="p-4 border-t border-slate-700 flex gap-2">
              <input
                className="input flex-1 bg-slate-700 border-slate-600 text-white"
                placeholder="Ask a question..."
                value={agentInput}
                onChange={(e) => setAgentInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && askAgent()}
              />
              <button className="btn-primary" onClick={askAgent} disabled={agentLoading}>Send</button>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-slate-800 px-6 py-4 flex items-center justify-between">
        <button className="btn-secondary" onClick={prevStep} disabled={currentStep === 0}>
          ← Previous
        </button>
        <div className="flex gap-2">
          {steps.map((_, i) => (
            <button
              key={i}
              className={`w-2 h-2 rounded-full ${i === currentStep ? "bg-brand-500 w-6" : "bg-slate-600"}`}
              onClick={() => setCurrentStep(i)}
            />
          ))}
        </div>
        <button className="btn-primary" onClick={nextStep} disabled={currentStep === steps.length - 1}>
          {currentStep === steps.length - 1 ? "Finish" : "Next →"}
        </button>
      </div>

      {/* Email gate modal */}
      {showEmail && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="card w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Get full access</h3>
            <p className="text-sm text-slate-600 mb-4">Enter your email to unlock the full demo and receive a recording.</p>
            <div className="space-y-3">
              <input className="input" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input className="input" placeholder="Company (optional)" value={company} onChange={(e) => setCompany(e.target.value)} />
              <div className="flex gap-3">
                <button className="btn-secondary flex-1" onClick={() => setShowEmail(false)}>Skip</button>
                <button className="btn-primary flex-1" onClick={handleEmailSubmit}>Unlock</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
