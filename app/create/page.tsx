"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface CapturedStep {
  order: number;
  title: string;
  description: string;
  snapshot: string;      // HTML string (screenshot + annotation dots baked in)
  hotspots: string;      // JSON
  // extra for preview only — not sent to API
  _screenshotDataUrl?: string;
}

export default function CreateDemoPage() {
  const router = useRouter();
  const [demoTitle, setDemoTitle] = useState("");
  const [demoDescription, setDemoDescription] = useState("");
  const [recording, setRecording] = useState(false);
  const [steps, setSteps] = useState<CapturedStep[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const popupRef = useRef<Window | null>(null);
  const listenerRef = useRef<((e: MessageEvent) => void) | null>(null);

  useEffect(() => {
    return () => {
      if (listenerRef.current) window.removeEventListener("message", listenerRef.current);
    };
  }, []);

  function startRecording() {
    if (listenerRef.current) window.removeEventListener("message", listenerRef.current);

    const captureUrl = `${window.location.origin}/capture?demo=1`;
    const popup = window.open(
      captureUrl,
      "DemoHubCapture",
      "width=1280,height=820,resizable=yes,scrollbars=yes"
    );
    if (!popup) {
      alert("Please allow popups for this site to use the recorder");
      return;
    }
    popupRef.current = popup;

    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (event.data?.type === "DEMO_STEP" && event.data?.demo === "1") {
        const incoming = event.data.step as CapturedStep;
        setSteps((prev) => {
          const idx = prev.findIndex((s) => s.order === incoming.order);
          if (idx !== -1) {
            const copy = [...prev];
            copy[idx] = incoming;
            return copy;
          }
          return [...prev, incoming].sort((a, b) => a.order - b.order);
        });
      }

      if (event.data?.type === "DEMO_DONE" && event.data?.demo === "1") {
        setRecording(false);
        window.removeEventListener("message", handler);
        listenerRef.current = null;
        try { popup.close(); } catch {}
      }

      // Capture page saved the demo directly — navigate to it
      if (event.data?.type === "DEMO_SAVED" && event.data?.demo === "1") {
        setRecording(false);
        window.removeEventListener("message", handler);
        listenerRef.current = null;
        try { popup.close(); } catch {}
        if (event.data.demoId) {
          router.push(`/demo/${event.data.demoId}`);
        }
      }
    };

    window.addEventListener("message", handler);
    listenerRef.current = handler;
    setRecording(true);
  }

  function stopRecording() {
    setRecording(false);
    if (listenerRef.current) {
      window.removeEventListener("message", listenerRef.current);
      listenerRef.current = null;
    }
    try { popupRef.current?.close(); } catch {}
  }

  function updateStep(index: number, field: "title" | "description", value: string) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  }

  function deleteStep(index: number) {
    setSteps((prev) =>
      prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i }))
    );
    if (expandedStep === index) setExpandedStep(null);
  }

  function addManualStep() {
    const n = steps.length + 1;
    setSteps((prev) => [
      ...prev,
      {
        order: prev.length,
        title: `Step ${n}`,
        description: "",
        snapshot: `<div style="font-family:sans-serif;padding:40px;color:#94a3b8;background:#f8fafc;min-height:200px;display:flex;align-items:center;justify-content:center;">
          <div style="text-align:center">
            <div style="font-size:32px;margin-bottom:12px">📋</div>
            <div style="font-size:16px;font-weight:600;color:#334155">Step ${n}</div>
            <div style="font-size:13px;margin-top:4px">Manual step — edit title and description above</div>
          </div>
        </div>`,
        hotspots: "[]",
      },
    ]);
  }

  async function saveDemo() {
    if (!demoTitle.trim()) {
      // Scroll to and focus the title input
      const el = document.getElementById("demo-title-input");
      if (el) { el.focus(); (el as HTMLInputElement).select(); }
      setSaveError("Please enter a demo title in the field at the top");
      return;
    }
    if (steps.length === 0) { alert("Add at least one step"); return; }

    setSaving(true);
    setSaveError("");
    try {
      const demoRes = await fetch("/api/demos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: demoTitle.trim(),
          description: demoDescription.trim(),
          type: "interactive",
        }),
      });
      const demo = await demoRes.json();
      if (!demoRes.ok) { setSaveError(demo.error || "Failed to create demo"); return; }

      const payload = steps.map((s, i) => ({
        order: i,
        title: s.title,
        description: s.description,
        snapshot: s.snapshot,
        hotspots: typeof s.hotspots === "string" ? s.hotspots : JSON.stringify(s.hotspots ?? []),
      }));

      const stepsRes = await fetch(`/api/demos/${demo.id}/steps`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps: payload }),
      });
      if (!stepsRes.ok) {
        const err = await stepsRes.json().catch(() => ({}));
        setSaveError(err.error || "Failed to save steps");
        return;
      }

      router.push(`/demo/${demo.id}`);
    } catch {
      setSaveError("Network error — please try again");
    } finally {
      setSaving(false);
    }
  }

  // Extract screenshot data URL from the snapshot HTML for thumbnail
  function getThumbSrc(snapshot: string): string | null {
    const match = snapshot.match(/src="(data:image\/png;base64,[^"]+)"/);
    return match ? match[1] : null;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-3">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold flex-shrink-0">Create Demo</h1>
            {/* Title input inline in header — always visible */}
            <input
              className="input flex-1 text-sm font-medium"
              value={demoTitle}
              onChange={(e) => setDemoTitle(e.target.value)}
              placeholder="Demo title (required) — e.g. How to create an invoice"
              id="demo-title-input"
            />
            <button className="btn-secondary flex-shrink-0" onClick={() => router.push("/dashboard")}>
              Cancel
            </button>
            <button
              className="btn-primary flex-shrink-0"
              onClick={saveDemo}
              disabled={saving || steps.length === 0}
            >
              {saving
                ? "Saving…"
                : steps.length > 0
                ? `Save Demo (${steps.length} step${steps.length !== 1 ? "s" : ""})`
                : "Save Demo"}
            </button>
          </div>
          {!demoTitle.trim() && steps.length > 0 && (
            <p className="text-xs text-amber-600 mt-1 pl-1">⚠ Enter a title above to save</p>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {saveError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            ⚠ {saveError}
          </div>
        )}

        {/* Demo description (title is in the header) */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">Description <span className="text-sm font-normal text-slate-400">(optional)</span></h2>
          <textarea
            className="input"
            value={demoDescription}
            onChange={(e) => setDemoDescription(e.target.value)}
            rows={2}
            placeholder="What is this demo about?"
          />
        </div>

        {/* Recording controls */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-2">Record Steps</h2>
          <p className="text-sm text-slate-500 mb-4">
            Click <strong>Start Recording</strong> to open the capture tool. Navigate your app,
            take a screenshot for each step, click on the screenshot to annotate, then click
            <strong> Save Step & Continue</strong>. When done, click <strong>Done ✓</strong> in the capture window.
          </p>
          <div className="flex flex-wrap gap-3">
            {!recording ? (
              <button className="btn-primary" onClick={startRecording}>
                🎬 Start Recording
              </button>
            ) : (
              <>
                <button
                  className="px-4 py-2 rounded border border-red-300 text-red-600 bg-white hover:bg-red-50 text-sm font-medium"
                  onClick={stopRecording}
                >
                  ⏹ Stop
                </button>
                <span className="self-center text-sm text-indigo-600 animate-pulse font-medium">
                  ● Recording in popup…
                </span>
              </>
            )}
            <button className="btn-secondary" onClick={addManualStep}>
              + Add Manual Step
            </button>
          </div>
        </div>

        {/* Steps */}
        {steps.length > 0 && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Steps ({steps.length})</h2>
            </div>
            <div className="space-y-3">
              {steps.map((step, i) => {
                const thumb = getThumbSrc(step.snapshot);
                const isExpanded = expandedStep === i;
                return (
                  <div key={i} className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                    {/* Step row */}
                    <div className="flex items-center gap-3 p-4">
                      {/* Thumbnail */}
                      <div className="flex-shrink-0 w-24 h-16 rounded-lg overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center">
                        {thumb ? (
                          <img src={thumb} alt={`step ${i + 1}`} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-2xl">📋</span>
                        )}
                      </div>

                      {/* Step number badge */}
                      <span className="flex-shrink-0 text-xs font-mono bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-1 rounded-full">
                        {i + 1}
                      </span>

                      {/* Title + description inline */}
                      <div className="flex-1 min-w-0">
                        <input
                          className="input font-medium text-sm mb-1"
                          value={step.title}
                          onChange={(e) => updateStep(i, "title", e.target.value)}
                          placeholder="Step title"
                        />
                        <input
                          className="input text-sm text-slate-500"
                          value={step.description}
                          onChange={(e) => updateStep(i, "description", e.target.value)}
                          placeholder="Description (optional)"
                        />
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          className="text-xs text-slate-400 hover:text-slate-700 px-2 py-1 rounded border border-slate-200 hover:border-slate-400"
                          onClick={() => setExpandedStep(isExpanded ? null : i)}
                        >
                          {isExpanded ? "▲ Hide" : "▼ Preview"}
                        </button>
                        <button
                          className="text-red-400 hover:text-red-600 text-sm px-2"
                          onClick={() => deleteStep(i)}
                          title="Delete"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Expanded snapshot preview */}
                    {isExpanded && (
                      <div className="border-t border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs text-slate-400 mb-2 font-medium">SCREENSHOT PREVIEW</p>
                        <div
                          className="rounded-lg overflow-hidden border border-slate-200 bg-white"
                          style={{ maxHeight: 400, overflow: "auto" }}
                          dangerouslySetInnerHTML={{ __html: step.snapshot }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-5 pt-4 border-t border-slate-100">
              {!demoTitle.trim() && (
                <p className="text-sm text-amber-600 mb-3 text-center">
                  ⚠ Enter a title in the bar at the top first
                </p>
              )}
              <button
                className="btn-primary w-full py-3"
                onClick={saveDemo}
                disabled={saving}
              >
                {saving
                  ? "Saving…"
                  : `Save Demo (${steps.length} step${steps.length !== 1 ? "s" : ""})`}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
