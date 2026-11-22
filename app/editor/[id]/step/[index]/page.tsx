"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export const dynamic = "force-dynamic";

export default function StepEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  // The route folder is [index], so the param key is "index"
  const stepIndex = parseInt(params.index as string);

  const [demo, setDemo] = useState<any>(null);
  const [step, setStep] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/demos/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setDemo(d);
        const s = d.steps?.[stepIndex];
        if (s) {
          setStep(s);
        } else {
          setError("Step not found");
        }
      })
      .catch(() => setError("Failed to load demo"));
  }, [id, stepIndex]);

  async function save() {
    if (!step) return;
    setSaving(true);
    setError("");
    try {
      // Use the bulk PUT to replace all steps — this avoids creating duplicates.
      // We patch only this step's title/description/hotspots and keep the rest intact.
      const demoData = await fetch(`/api/demos/${id}`).then((r) => r.json());
      const updatedSteps = (demoData.steps || []).map((s: any, i: number) => {
        if (i === stepIndex) {
          return {
            order: i,
            title: step.title,
            description: step.description,
            snapshot: step.snapshot,
            hotspots:
              typeof step.hotspots === "string"
                ? step.hotspots
                : JSON.stringify(step.hotspots || []),
            videoUrl: step.videoUrl,
            duration: step.duration,
            type: step.type,
            pageUrl: step.pageUrl,
            pageTitle: step.pageTitle,
            clickX: step.clickX,
            clickY: step.clickY,
            elementJson: step.elementJson,
            callout: step.callout,
            hotspot: step.hotspot,
            blurs: step.blurs,
            annotations: step.annotations,
            crop: step.crop,
            background: step.background,
            aiStatus: step.aiStatus,
            screenshotUrl: step.screenshotUrl,
            voiceScript: step.voiceScript,
            voiceAudioUrl: step.voiceAudioUrl,
            voiceStatus: step.voiceStatus,
            avatarVideoUrl: step.avatarVideoUrl,
            avatarStatus: step.avatarStatus,
            avatarImageUrl: step.avatarImageUrl,
            avatarTalkId: step.avatarTalkId,
          };
        }
        return {
          order: i,
          title: s.title,
          description: s.description,
          snapshot: s.snapshot,
          hotspots:
            typeof s.hotspots === "string" ? s.hotspots : JSON.stringify(s.hotspots || []),
          videoUrl: s.videoUrl,
          duration: s.duration,
          type: s.type,
          pageUrl: s.pageUrl,
          pageTitle: s.pageTitle,
          clickX: s.clickX,
          clickY: s.clickY,
          elementJson: s.elementJson,
          callout: s.callout,
          hotspot: s.hotspot,
          blurs: s.blurs,
          annotations: s.annotations,
          crop: s.crop,
          background: s.background,
          aiStatus: s.aiStatus,
          screenshotUrl: s.screenshotUrl,
          voiceScript: s.voiceScript,
          voiceAudioUrl: s.voiceAudioUrl,
          voiceStatus: s.voiceStatus,
          avatarVideoUrl: s.avatarVideoUrl,
          avatarStatus: s.avatarStatus,
          avatarImageUrl: s.avatarImageUrl,
          avatarTalkId: s.avatarTalkId,
        };
      });

      const res = await fetch(`/api/demos/${id}/steps`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps: updatedSteps }),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Failed to save step");
        return;
      }

      router.push(`/demo/${id}`);
    } catch (e) {
      setError("Failed to save step");
    } finally {
      setSaving(false);
    }
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

  if (error) {
    return (
      <div className="p-8 text-red-600">{error}</div>
    );
  }

  if (!step) {
    return <div className="p-8 text-slate-500">Loading...</div>;
  }

  const hotspots = JSON.parse(step.hotspots || "[]");

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button className="text-slate-500" onClick={() => router.push(`/demo/${id}`)}>
              ← Back
            </button>
            <h1 className="text-xl font-bold">Edit Step {stepIndex + 1}</h1>
          </div>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save & Back"}
          </button>
        </div>
      </header>

      {error && (
        <div className="max-w-5xl mx-auto px-6 pt-4">
          <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-6 py-8 grid lg:grid-cols-2 gap-8">
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Content</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Title</label>
              <input
                className="input"
                value={step.title || ""}
                onChange={(e) => setStep({ ...step, title: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                className="input"
                value={step.description || ""}
                onChange={(e) => setStep({ ...step, description: e.target.value })}
                rows={4}
              />
            </div>
            {step.videoUrl && (
              <div>
                <label className="block text-sm font-medium mb-1">Video URL</label>
                <input
                  className="input"
                  value={step.videoUrl}
                  onChange={(e) => setStep({ ...step, videoUrl: e.target.value })}
                />
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Hotspots ({hotspots.length})</h2>
            <button className="btn-secondary text-sm" onClick={addHotspot}>
              + Add Hotspot
            </button>
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
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                  <span>X: {hs.x?.toFixed(1)}%</span>
                  <span>Y: {hs.y?.toFixed(1)}%</span>
                </div>
              </div>
            ))}
            {hotspots.length === 0 && (
              <p className="text-sm text-slate-400">No hotspots yet. Click "+ Add Hotspot" to add one.</p>
            )}
          </div>
        </div>

        {/* Snapshot preview */}
        {step.snapshot && (
          <div className="card lg:col-span-2">
            <h2 className="text-lg font-semibold mb-4">Snapshot Preview</h2>
            <div
              className="border border-slate-200 rounded overflow-auto max-h-96 bg-white text-sm"
              dangerouslySetInnerHTML={{ __html: step.snapshot }}
            />
          </div>
        )}
      </main>
    </div>
  );
}
