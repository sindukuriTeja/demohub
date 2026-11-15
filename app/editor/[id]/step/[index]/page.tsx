"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export const dynamic = "force-dynamic";

export default function StepEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const stepIndex = parseInt(params.step as string);

  const [demo, setDemo] = useState<any>(null);
  const [step, setStep] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/demos/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setDemo(d);
        setStep(d.steps[stepIndex]);
      });
  }, [id, stepIndex]);

  async function save() {
    if (!step) return;
    setSaving(true);
    await fetch(`/api/demos/${id}/steps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order: stepIndex,
        title: step.title,
        description: step.description,
        snapshot: step.snapshot,
        hotspots: step.hotspots,
        videoUrl: step.videoUrl,
        duration: step.duration,
      }),
    });
    setSaving(false);
    router.push(`/demo/${id}`);
  }

  function addHotspot() {
    const hotspots = JSON.parse(step?.hotspots || "[]");
    hotspots.push({
      id: Math.random().toString(36).slice(2),
      x: 50,
      y: 50,
      width: 8,
      height: 8,
      label: "New hotspot",
    });
    setStep({ ...step, hotspots: JSON.stringify(hotspots) });
  }

  if (!step) return <div className="p-8">Loading...</div>;

  const hotspots = JSON.parse(step.hotspots || "[]");

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button className="text-slate-500" onClick={() => router.push(`/demo/${id}`)}>← Back</button>
            <h1 className="text-xl font-bold">Edit Step {stepIndex + 1}</h1>
          </div>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save & Back"}</button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 grid lg:grid-cols-2 gap-8">
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Content</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Title</label>
              <input className="input" value={step.title || ""} onChange={(e) => setStep({ ...step, title: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea className="input" value={step.description || ""} onChange={(e) => setStep({ ...step, description: e.target.value })} rows={4} />
            </div>
            {step.videoUrl && (
              <div>
                <label className="block text-sm font-medium mb-1">Video URL</label>
                <input className="input" value={step.videoUrl} onChange={(e) => setStep({ ...step, videoUrl: e.target.value })} />
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Hotspots ({hotspots.length})</h2>
            <button className="btn-secondary text-sm" onClick={addHotspot}>+ Add Hotspot</button>
          </div>
          <div className="space-y-3">
            {hotspots.map((hs: any, i: number) => (
              <div key={hs.id} className="border border-slate-200 rounded p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs bg-slate-100 px-2 py-1 rounded">#{i + 1}</span>
                  <input
                    className="input flex-1 text-sm"
                    value={hs.label || ""}
                    onChange={(e) => {
                      const updated = [...hotspots];
                      updated[i].label = e.target.value;
                      setStep({ ...step, hotspots: JSON.stringify(updated) });
                    }}
                    placeholder="Label"
                  />
                  <button
                    className="text-red-500 text-sm"
                    onClick={() => {
                      const updated = hotspots.filter((_: any, idx: number) => idx !== i);
                      setStep({ ...step, hotspots: JSON.stringify(updated) });
                    }}
                  >
                    ✕
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div>
                    <label className="text-slate-500">X %</label>
                    <input type="number" className="input" value={hs.x} onChange={(e) => {
                      const updated = [...hotspots];
                      updated[i].x = Number(e.target.value);
                      setStep({ ...step, hotspots: JSON.stringify(updated) });
                    }} />
                  </div>
                  <div>
                    <label className="text-slate-500">Y %</label>
                    <input type="number" className="input" value={hs.y} onChange={(e) => {
                      const updated = [...hotspots];
                      updated[i].y = Number(e.target.value);
                      setStep({ ...step, hotspots: JSON.stringify(updated) });
                    }} />
                  </div>
                  <div>
                    <label className="text-slate-500">W %</label>
                    <input type="number" className="input" value={hs.width} onChange={(e) => {
                      const updated = [...hotspots];
                      updated[i].width = Number(e.target.value);
                      setStep({ ...step, hotspots: JSON.stringify(updated) });
                    }} />
                  </div>
                  <div>
                    <label className="text-slate-500">H %</label>
                    <input type="number" className="input" value={hs.height} onChange={(e) => {
                      const updated = [...hotspots];
                      updated[i].height = Number(e.target.value);
                      setStep({ ...step, hotspots: JSON.stringify(updated) });
                    }} />
                  </div>
                </div>
              </div>
            ))}
            {hotspots.length === 0 && <p className="text-slate-500 text-sm">No hotspots. Click "Add Hotspot" to create clickable areas.</p>}
          </div>
        </div>
      </main>
    </div>
  );
}
