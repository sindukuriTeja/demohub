"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function CreateDemoPage() {
  const router = useRouter();
  const [demoTitle, setDemoTitle] = useState("");
  const [demoDescription, setDemoDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [demoId, setDemoId] = useState<string | null>(null);
  const [steps, setSteps] = useState<any[]>([]);

  // Load draft demo if already created
  useEffect(() => {
    const draft = sessionStorage.getItem("demohub_draft");
    if (draft) {
      try {
        const { id, title, description } = JSON.parse(draft);
        setDemoId(id); setDemoTitle(title || ""); setDemoDescription(description || "");
        fetch(`/api/demos/${id}`).then(r => r.json()).then(d => {
          if (d.steps) setSteps(d.steps.sort((a: any, b: any) => a.order - b.order));
        });
      } catch {}
    }
  }, []);

  async function ensureDemo(): Promise<string | null> {
    if (demoId) {
      // Update title/description if changed
      await fetch(`/api/demos/${demoId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: demoTitle.trim() || "Untitled Demo", description: demoDescription.trim() }),
      });
      return demoId;
    }
    setSaving(true);
    const res = await fetch("/api/demos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: demoTitle.trim() || "Untitled Demo", description: demoDescription.trim(), type: "interactive" }),
    });
    const demo = await res.json();
    if (!res.ok) { setSaveError(demo.error || "Failed"); setSaving(false); return null; }
    setDemoId(demo.id);
    sessionStorage.setItem("demohub_draft", JSON.stringify({ id: demo.id, title: demo.title, description: demo.description }));
    setSaving(false);
    return demo.id;
  }

  async function startRecording() {
    setSaveError("");
    const id = await ensureDemo();
    if (!id) return;
    router.push(`/capture?demo=${id}`);
  }

  async function openEditor() {
    if (!demoId) return;
    router.push(`/editor/${demoId}`);
  }

  function getThumbSrc(step: any): string {
    if (step.screenshotUrl) return step.screenshotUrl;
    if (step.snapshot) { const m = step.snapshot.match(/src="([^"]+)"/); if (m) return m[1]; }
    return "";
  }

  return (
    <div className="min-h-screen bg-[#F4F5FB]" style={{ fontFamily: "Inter, sans-serif" }}>
      {/* Header */}
      <header className="bg-white border-b border-[#E5E7EB] sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-slate-400 hover:text-slate-700">←</Link>
            <h1 className="text-lg font-bold text-[#0F172A]">Create Demo</h1>
          </div>
          <div className="flex gap-3">
            <button onClick={() => { sessionStorage.removeItem("demohub_draft"); router.push("/dashboard"); }}
              className="px-4 py-2 rounded-lg border border-[#E5E7EB] text-sm text-slate-600 hover:border-slate-400">
              Cancel
            </button>
            {steps.length > 0 && (
              <button onClick={openEditor}
                className="px-4 py-2 rounded-lg bg-[#5B3DF5] hover:bg-[#4C2FE0] text-white text-sm font-semibold">
                Open Editor →
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-5">
        {saveError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">⚠ {saveError}</div>
        )}

        {/* Demo details card */}
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 space-y-4">
          <h2 className="font-semibold text-[#0F172A]">Demo Details</h2>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Title</label>
            <input
              className="w-full border border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#5B3DF5]"
              value={demoTitle}
              onChange={(e) => setDemoTitle(e.target.value)}
              placeholder="e.g. How to sign up for FindJobs"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Description <span className="text-slate-400 font-normal">(optional)</span></label>
            <textarea
              className="w-full border border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#5B3DF5] resize-none"
              rows={2}
              value={demoDescription}
              onChange={(e) => setDemoDescription(e.target.value)}
              placeholder="What does this demo show?"
            />
          </div>
        </div>

        {/* Record steps card */}
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 space-y-4">
          <div>
            <h2 className="font-semibold text-[#0F172A] mb-1">Record steps</h2>
            <p className="text-sm text-slate-500">
              Open your website in the DemoHub recorder. Every click you make becomes a step automatically, with a screenshot and an AI caption.
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={startRecording} disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#5B3DF5] hover:bg-[#4C2FE0] text-white rounded-xl text-sm font-semibold disabled:opacity-60 transition-colors">
              🎬 Start recording
            </button>
            <button onClick={async () => { const id = await ensureDemo(); if (id) alert("Upload step coming soon — use Start recording and click 'Capture screen'"); }}
              className="flex items-center gap-2 px-5 py-2.5 border border-[#E5E7EB] hover:border-slate-400 text-slate-600 rounded-xl text-sm font-medium transition-colors">
              🖼 Add manual step
            </button>
          </div>
        </div>

        {/* Steps preview */}
        {steps.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-[#0F172A]">{steps.length} step{steps.length !== 1 ? "s" : ""} recorded</h2>
              <button onClick={openEditor}
                className="text-sm text-[#5B3DF5] font-medium hover:underline">
                Open editor →
              </button>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {steps.slice(0, 8).map((s, i) => (
                <div key={s.id} className="flex-shrink-0 w-32">
                  <div className="relative rounded-xl overflow-hidden border border-[#E5E7EB] bg-slate-50" style={{ aspectRatio: "16/10" }}>
                    {getThumbSrc(s) ? (
                      <img src={getThumbSrc(s)} alt="" className="w-full h-full object-cover object-top" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-300 text-xl">📋</div>
                    )}
                    <span className="absolute bottom-1 left-1 w-5 h-5 rounded-full bg-[#5B3DF5] text-white text-[10px] font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 truncate">{s.title || "Step"}</p>
                </div>
              ))}
              {steps.length > 8 && (
                <div className="flex-shrink-0 w-32 flex items-center justify-center text-slate-400 text-sm">
                  +{steps.length - 8} more
                </div>
              )}
            </div>
            <button onClick={openEditor}
              className="mt-4 w-full py-3 bg-[#5B3DF5] hover:bg-[#4C2FE0] text-white rounded-xl text-sm font-semibold transition-colors">
              Open in Editor →
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
