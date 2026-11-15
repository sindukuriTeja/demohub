"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Hotspot type
interface Hotspot {
  id: string;
  x: number; // percentage 0-100
  y: number;
  width: number;
  height: number;
  label?: string;
  nextStep?: number; // if this hotspot advances to a step
}

interface CapturedStep {
  order: number;
  title: string;
  description: string;
  snapshot: string; // HTML string of the captured area
  hotspots: Hotspot[];
}

export default function CreateDemoPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [recording, setRecording] = useState(false);
  const [steps, setSteps] = useState<CapturedStep[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [captured, setCaptured] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Start recording: open a popup to capture clicks
  async function startRecording() {
    const captureUrl = `${window.location.origin}/capture?demo=1`;
    const popup = window.open(captureUrl, "DemoHub Capture", "width=1200,height=800");
    if (!popup) {
      alert("Please allow popups to record a demo");
      return;
    }

    // Listen for captured steps from the popup
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "DEMO_STEP" && event.data?.demo === "1") {
        setSteps((prev) => {
          const exists = prev.find((s) => s.order === event.data.step.order);
          if (exists) {
            return prev.map((s) => (s.order === event.data.step.order ? event.data.step : s));
          }
          return [...prev, event.data.step].sort((a, b) => a.order - b.order);
        });
        setCurrentStep((c) => Math.max(c, event.data.step.order));
      }
      if (event.data?.type === "DEMO_DONE" && event.data?.demo === "1") {
        setCaptured(true);
        setRecording(false);
        popup.close();
      }
    };
    window.addEventListener("message", handler);

    setRecording(true);
    // Store listener ref for cleanup
    (window as any).__demoListener = handler;
  }

  function stopRecording() {
    setRecording(false);
    if ((window as any).__demoListener) {
      window.removeEventListener("message", (window as any).__demoListener);
    }
    setCaptured(true);
  }

  async function saveDemo() {
    if (!title.trim()) {
      alert("Please give your demo a title");
      return;
    }
    setSaving(true);
    try {
      const demoRes = await fetch("/api/demos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, type: "interactive" }),
      });
      const demo = await demoRes.json();
      if (demoRes.status !== 200) {
        alert(demo.error || "Failed to create demo");
        return;
      }

      // Save steps
      await fetch(`/api/demos/${demo.id}/steps`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps: steps.map((s, i) => ({ ...s, order: i })) }),
      });

      router.push(`/demo/${demo.id}`);
    } catch (e) {
      alert("Failed to save demo");
    } finally {
      setSaving(false);
    }
  }

  function addManualStep() {
    setSteps((prev) => [
      ...prev,
      {
        order: prev.length,
        title: "New Step",
        description: "",
        snapshot: "<div class='p-8 text-slate-400'>Empty step — edit in player</div>",
        hotspots: [],
      },
    ]);
  }

  function updateStep(order: number, field: keyof CapturedStep, value: any) {
    setSteps((prev) => prev.map((s) => (s.order === order ? { ...s, [field]: value } : s)));
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">Create Demo</h1>
          <div className="flex gap-3">
            <button className="btn-secondary" onClick={() => router.push("/dashboard")}>Cancel</button>
            <button className="btn-primary" onClick={saveDemo} disabled={saving || steps.length === 0}>
              {saving ? "Saving..." : "Save Demo"}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="card mb-6">
          <h2 className="text-lg font-semibold mb-4">Demo Details</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Title</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. How to create an invoice" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What is this demo about?" />
            </div>
          </div>
        </div>

        <div className="card mb-6">
          <h2 className="text-lg font-semibold mb-4">Record Steps</h2>
          <p className="text-sm text-slate-600 mb-4">
            Click "Start Recording" to open a capture window. Click through your product — each click creates a step with a hotspot.
          </p>
          <div className="flex gap-3">
            <button className="btn-primary" onClick={startRecording} disabled={recording}>
              {recording ? "Recording..." : "Start Recording"}
            </button>
            {recording && <button className="btn-secondary" onClick={stopRecording}>Stop</button>}
            <button className="btn-secondary" onClick={addManualStep}>+ Add Manual Step</button>
          </div>
          {recording && <p className="mt-3 text-sm text-brand-600">● Recording — click through your product in the popup window</p>}
        </div>

        {steps.length > 0 && (
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Captured Steps ({steps.length})</h2>
            <div className="space-y-4">
              {steps.map((step, i) => (
                <div key={i} className="border border-slate-200 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-sm font-mono bg-slate-100 px-2 py-1 rounded">Step {i + 1}</span>
                    <input
                      className="input flex-1"
                      value={step.title}
                      onChange={(e) => updateStep(i, "title", e.target.value)}
                      placeholder="Step title"
                    />
                    <button
                      className="text-red-500 text-sm"
                      onClick={() => setSteps((prev) => prev.filter((s) => s.order !== i))}
                    >
                      Delete
                    </button>
                  </div>
                  <textarea
                    className="input mb-3"
                    value={step.description}
                    onChange={(e) => updateStep(i, "description", e.target.value)}
                    rows={2}
                    placeholder="Step description"
                  />
                  <div className="text-xs text-slate-500">
                    {step.hotspots.length} hotspot{step.hotspots.length !== 1 ? "s" : ""} captured
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
