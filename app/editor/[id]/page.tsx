"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Callout {
  text: string; x: number; y: number; width: number;
  placement: string; fontFamily: string; fontSize: number;
  bold: boolean; italic: boolean; textColor: string; bgColor: string;
  showArrow: boolean; emoji: string;
}
interface Hotspot { x: number; y: number; w: number; h: number; shape: string; }
interface BlurRect { x: number; y: number; w: number; h: number; }

interface Step {
  id: string; order: number; title: string | null; description: string | null;
  screenshotUrl: string | null; snapshot: string | null;
  type: string; pageUrl: string | null; pageTitle: string | null;
  clickX: number | null; clickY: number | null;
  callout: string | null; hotspot: string | null;
  blurs: string | null; annotations: string | null;
  crop: string | null; background: string | null;
  aiStatus: string; hotspots: string;
  voiceScript: string | null; voiceAudioUrl: string | null; voiceStatus: string;
  avatarImageUrl: string | null; avatarVideoUrl: string | null; avatarStatus: string; avatarTalkId: string | null;
}

interface Demo {
  id: string; title: string; description: string | null;
  status: string; stepDurationSec: number; shareToken: string;
  isPublished: boolean; steps: Step[];
  clonedVoiceId: string | null; clonedVoiceName: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
}

function getImgSrc(step: Step): string {
  if (step.screenshotUrl) return step.screenshotUrl;
  if (step.snapshot) {
    const m = step.snapshot.match(/src="([^"]+)"/);
    if (m) return m[1];
  }
  return "";
}

// ─── Main editor component ───────────────────────────────────────────────────
export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const demoId = params.id as string;

  const [demo, setDemo] = useState<Demo | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [editingTitle, setEditingTitle] = useState(false);
  const [demoTitle, setDemoTitle] = useState("");
  const [zoom, setZoom] = useState(1);
  const [addStepOpen, setAddStepOpen] = useState<number | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [editingCallout, setEditingCallout] = useState(false);
  const [calloutText, setCalloutText] = useState("");
  const [undoStack, setUndoStack] = useState<Step[][]>([]);

  const saveTimeout = useRef<NodeJS.Timeout | null>(null);
  const calloutInputRef = useRef<HTMLTextAreaElement>(null);

  // ── Load demo ──────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/demos/${demoId}`)
      .then(r => r.json())
      .then(d => {
        setDemo(d);
        setDemoTitle(d.title || "");
        const sorted = [...(d.steps || [])].sort((a: Step, b: Step) => a.order - b.order);
        setSteps(sorted);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [demoId]);

  // Poll for AI captions
  useEffect(() => {
    const pending = steps.some(s => s.aiStatus === "pending");
    if (!pending) return;
    const t = setTimeout(() => {
      fetch(`/api/demos/${demoId}`)
        .then(r => r.json())
        .then(d => {
          const sorted = [...(d.steps || [])].sort((a: Step, b: Step) => a.order - b.order);
          setSteps(sorted);
        });
    }, 2000);
    return () => clearTimeout(t);
  }, [steps, demoId]);

  const step = steps[selectedIdx] ?? null;

  // ── Auto-save ─────────────────────────────────────────────────────────────
  const schedSave = useCallback((updatedStep: Step) => {
    setSaveState("saving");
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      try {
        await fetch(`/api/demos/${demoId}/steps`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            steps: steps.map(s => s.id === updatedStep.id ? updatedStep : s).map((s, i) => ({
              order: i, title: s.title, description: s.description,
              snapshot: s.snapshot, hotspots: s.hotspots,
              callout: s.callout, hotspot: s.hotspot,
              blurs: s.blurs, annotations: s.annotations,
              crop: s.crop, background: s.background,
              screenshotUrl: s.screenshotUrl, type: s.type,
              pageUrl: s.pageUrl, pageTitle: s.pageTitle,
              clickX: s.clickX, clickY: s.clickY, aiStatus: s.aiStatus,
            })),
          }),
        });
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 800);
  }, [steps, demoId]);

  function updateStep(patch: Partial<Step>) {
    if (!step) return;
    // push to undo stack
    setUndoStack(u => [...u.slice(-49), steps]);
    const updated = { ...step, ...patch };
    setSteps(prev => prev.map(s => s.id === updated.id ? updated : s));
    schedSave(updated);
  }

  function undo() {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack(u => u.slice(0, -1));
    setSteps(prev);
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowDown") { setSelectedIdx(i => Math.min(i + 1, steps.length - 1)); e.preventDefault(); }
      if (e.key === "ArrowUp") { setSelectedIdx(i => Math.max(i - 1, 0)); e.preventDefault(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "z") { undo(); e.preventDefault(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "d") { duplicateStep(); e.preventDefault(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [steps, undoStack]);

  // ── Step actions ──────────────────────────────────────────────────────────
  async function deleteStep(idx: number) {
    if (!confirm("Delete this step?")) return;
    const s = steps[idx];
    const newSteps = steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i }));
    setSteps(newSteps);
    if (selectedIdx >= newSteps.length) setSelectedIdx(Math.max(0, newSteps.length - 1));
    await fetch(`/api/demos/${demoId}/steps`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steps: newSteps.map((s, i) => ({ ...s, order: i })) }),
    });
  }

  function duplicateStep() {
    if (!step) return;
    const dup = { ...step, id: `dup-${Date.now()}`, order: selectedIdx + 1 };
    const newSteps = [
      ...steps.slice(0, selectedIdx + 1),
      dup,
      ...steps.slice(selectedIdx + 1),
    ].map((s, i) => ({ ...s, order: i }));
    setSteps(newSteps);
    setSelectedIdx(selectedIdx + 1);
  }

  function renameDemoTitle() {
    setEditingTitle(false);
    if (!demo || demoTitle === demo.title) return;
    fetch(`/api/demos/${demoId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: demoTitle }),
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4F5FB] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="text-4xl animate-pulse">✨</div>
          <p className="text-slate-500">Loading editor…</p>
        </div>
      </div>
    );
  }
  if (!demo) return <div className="p-8 text-red-600">Demo not found.</div>;

  const imgSrc = step ? getImgSrc(step) : "";
  const callout: Callout | null = parseJson(step?.callout, null);
  const hotspot: Hotspot | null = parseJson(step?.hotspot ?? step?.hotspots, null);
  const blurs: BlurRect[] = parseJson(step?.blurs, []);
  const shareUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/d/${demo.shareToken}`;

  // Canvas size
  const CANVAS_W = 700;
  const CANVAS_H = Math.round(CANVAS_W * 9 / 16);

  return (
    <div className="h-screen flex flex-col bg-[#F4F5FB] overflow-hidden" style={{ fontFamily: "Inter, sans-serif" }}>

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 h-14 bg-white border-b border-[#E5E7EB] flex items-center px-4 gap-3 shadow-sm">
        <button onClick={() => router.push("/dashboard")} className="text-slate-400 hover:text-slate-700 mr-1">
          ←
        </button>

        {/* Demo title */}
        {editingTitle ? (
          <input
            autoFocus
            className="text-base font-semibold border border-[#5B3DF5] rounded px-2 py-1 focus:outline-none"
            value={demoTitle}
            onChange={(e) => setDemoTitle(e.target.value)}
            onBlur={renameDemoTitle}
            onKeyDown={(e) => e.key === "Enter" && renameDemoTitle()}
          />
        ) : (
          <span className="text-base font-semibold text-[#0F172A] cursor-pointer hover:text-[#5B3DF5]"
            onClick={() => setEditingTitle(true)}>
            {demoTitle || "Untitled Demo"}
          </span>
        )}

        {/* Save state */}
        <span className={`text-xs font-medium ml-1 ${saveState === "saved" ? "text-green-500" : saveState === "saving" ? "text-slate-400" : "text-red-500"}`}>
          {saveState === "saved" ? "✓ Saved" : saveState === "saving" ? "Saving…" : "⚠ Save failed"}
        </span>

        <div className="flex-1" />

        {/* Tool buttons */}
        {["Hotspot", "Blur & annotate", "Chapter", "Enhance with AI", "Voiceover", "Avatar"].map(tool => (
          <button key={tool}
            onClick={() => setActiveTool(activeTool === tool ? null : tool)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
              activeTool === tool
                ? "bg-[#5B3DF5] text-white border-[#5B3DF5]"
                : "bg-white text-slate-600 border-[#E5E7EB] hover:border-[#5B3DF5] hover:text-[#5B3DF5]"
            } ${tool === "Enhance with AI" ? "text-[#5B3DF5]" : ""}`}>
            {tool}
          </button>
        ))}

        <div className="w-px h-6 bg-[#E5E7EB] mx-1" />

        <Link href={`/preview/${demoId}`} target="_blank"
          className="px-4 py-1.5 rounded-lg border border-[#E5E7EB] text-sm font-medium text-slate-700 hover:border-slate-400">
          Preview
        </Link>
        <button onClick={() => setShareOpen(true)}
          className="px-4 py-1.5 rounded-lg bg-[#5B3DF5] hover:bg-[#4C2FE0] text-white text-sm font-semibold">
          Share
        </button>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Left rail ────────────────────────────────────────────────────── */}
        <div className="w-64 bg-[#F7F7FB] border-r border-[#E5E7EB] flex flex-col overflow-hidden flex-shrink-0">
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {/* + Add step above first */}
            <AddStepButton idx={-1} open={addStepOpen === -1} onToggle={() => setAddStepOpen(addStepOpen === -1 ? null : -1)}
              demoId={demoId} steps={steps} setSteps={setSteps} setAddStepOpen={setAddStepOpen} />

            {steps.map((s, i) => (
              <div key={s.id}>
                <button
                  onClick={() => setSelectedIdx(i)}
                  className={`w-full text-left rounded-xl overflow-hidden border-2 transition-all ${
                    i === selectedIdx ? "border-[#5B3DF5] shadow-md shadow-indigo-200" : "border-transparent hover:border-slate-200"
                  }`}>
                  <div className="relative bg-slate-100" style={{ aspectRatio: "16/10" }}>
                    {getImgSrc(s) ? (
                      <img src={getImgSrc(s)} alt="" className="w-full h-full object-cover object-top" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-300 text-2xl">
                        {s.type === "chapter" ? "📖" : "📋"}
                      </div>
                    )}
                    <span className={`absolute bottom-1 left-1 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold ${i === selectedIdx ? "bg-[#5B3DF5]" : "bg-slate-800"}`}>
                      {i + 1}
                    </span>
                  </div>
                  <div className="px-2 py-1.5 bg-white">
                    <p className="text-xs font-medium text-slate-700 truncate">{s.title || "Untitled"}</p>
                    {s.aiStatus === "pending" && (
                      <p className="text-[10px] text-slate-400 animate-pulse">Writing caption…</p>
                    )}
                  </div>
                </button>

                {/* + Add step between */}
                <AddStepButton idx={i} open={addStepOpen === i} onToggle={() => setAddStepOpen(addStepOpen === i ? null : i)}
                  demoId={demoId} steps={steps} setSteps={setSteps} setAddStepOpen={setAddStepOpen} />
              </div>
            ))}
          </div>
        </div>

        {/* ── Center canvas ──────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Step label + size */}
          <div className="flex-shrink-0 flex items-center justify-between px-6 py-2">
            <input
              className="text-sm font-semibold text-slate-700 bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-[#5B3DF5] rounded px-1"
              value={step?.title || ""}
              onChange={(e) => updateStep({ title: e.target.value })}
              placeholder="Step title…"
            />
            <span className="text-xs text-slate-400">
              {demo.steps[selectedIdx] ? "1280 × 720" : ""}
            </span>
          </div>

          {/* Canvas area */}
          <div className="flex-1 overflow-auto flex items-start justify-center p-6">
            {step ? (
              <div style={{ width: CANVAS_W, transform: `scale(${zoom})`, transformOrigin: "top center" }}>
                {/* Browser frame */}
                <div className="rounded-2xl overflow-hidden border border-[#E5E7EB] shadow-lg bg-white">
                  {/* Browser chrome */}
                  <div className="bg-[#F1F3F4] px-4 py-2.5 flex items-center gap-2 border-b border-[#E5E7EB]">
                    <div className="w-3 h-3 rounded-full bg-red-400" />
                    <div className="w-3 h-3 rounded-full bg-yellow-400" />
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                    <div className="flex-1 mx-4">
                      <div className="bg-white rounded-full px-4 py-1 text-xs text-slate-500 text-center border border-[#E5E7EB] truncate">
                        {step.pageTitle || step.pageUrl || "about:blank"}
                      </div>
                    </div>
                  </div>

                  {/* Screenshot + overlays */}
                  <div className="relative bg-white" style={{ width: CANVAS_W, height: CANVAS_H }}>
                    {/* Show avatar video if generated, otherwise screenshot */}
                    {step.avatarVideoUrl ? (
                      <video
                        src={step.avatarVideoUrl}
                        controls
                        autoPlay
                        loop
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : imgSrc ? (
                      <img src={imgSrc} alt="step" className="absolute inset-0 w-full h-full object-cover object-top" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-slate-300 text-4xl">📋</div>
                    )}

                    {/* Blur rects */}
                    {blurs.map((b, bi) => (
                      <div key={bi} className="absolute" style={{
                        left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%`,
                        backdropFilter: "blur(8px)", background: "rgba(0,0,0,0.05)",
                      }} />
                    ))}

                    {/* Hotspot */}
                    {hotspot && (
                      <div className="absolute rounded-lg border-2 border-[#5B3DF5] animate-pulse"
                        style={{
                          left: `${(hotspot.x / 1280) * 100}%`,
                          top: `${(hotspot.y / 720) * 100}%`,
                          width: `${(hotspot.w / 1280) * 100}%`,
                          height: `${(hotspot.h / 720) * 100}%`,
                          background: "rgba(91,61,245,0.08)",
                          boxShadow: "0 0 0 3px rgba(91,61,245,0.2)",
                        }} />
                    )}

                    {/* Callout box */}
                    {callout && (
                      <CalloutOverlay
                        callout={callout}
                        canvasW={CANVAS_W} canvasH={CANVAS_H}
                        editing={editingCallout}
                        onEdit={() => { setEditingCallout(true); setCalloutText(callout.text); }}
                        onTextChange={(t) => {
                          const updated = { ...callout, text: t };
                          updateStep({ callout: JSON.stringify(updated) });
                        }}
                        onClose={() => setEditingCallout(false)}
                      />
                    )}
                  </div>
                </div>

                {/* Step description editor */}
                <div className="mt-3">
                  <textarea
                    className="w-full text-sm text-slate-600 bg-transparent border border-transparent hover:border-slate-200 focus:border-[#5B3DF5] rounded-lg px-3 py-2 focus:outline-none resize-none"
                    rows={2}
                    value={step.description || ""}
                    onChange={(e) => updateStep({ description: e.target.value })}
                    placeholder="Add a description…"
                  />
                </div>

                {/* Tool panels */}
                {activeTool === "Hotspot" && (
                  <HotspotPanel step={step} onUpdate={updateStep} />
                )}
                {activeTool === "Blur & annotate" && (
                  <BlurPanel step={step} onUpdate={updateStep} blurs={blurs} />
                )}
                {activeTool === "Chapter" && (
                  <ChapterPanel step={step} onUpdate={updateStep} />
                )}
                {activeTool === "Enhance with AI" && (
                  <EnhancePanel step={step} demoId={demoId} onUpdate={updateStep} steps={steps} />
                )}
                {activeTool === "Voiceover" && (
                  <VoiceoverPanel
                    step={step}
                    demo={demo}
                    onUpdate={(patch) => { updateStep(patch); }}
                    onDemoUpdate={(patch) => setDemo(d => d ? { ...d, ...patch } : d)}
                  />
                )}
                {activeTool === "Avatar" && (
                  <AvatarPanel
                    step={step}
                    demo={demo}
                    onUpdate={(patch) => { updateStep(patch); }}
                  />
                )}
              </div>
            ) : (
              <div className="text-center text-slate-400 mt-20">
                <p className="text-4xl mb-3">🎬</p>
                <p>No steps yet. <Link href={`/capture?demo=${demoId}`} className="text-[#5B3DF5] underline">Start recording</Link></p>
              </div>
            )}
          </div>

          {/* ── Bottom toolbar ────────────────────────────────────────────── */}
          <div className="flex-shrink-0 pb-4 flex justify-center">
            <div className="bg-white rounded-full border border-[#E5E7EB] shadow-md px-4 py-2 flex items-center gap-3">
              <button
                onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}
                className="text-[#5B3DF5] font-semibold text-sm px-3 py-1.5 bg-[#5B3DF5]/10 rounded-full hover:bg-[#5B3DF5]/20">
                Zoom {Math.round(zoom * 100)}%
              </button>
              <button onClick={() => setZoom(1)} className="text-xs text-slate-400 hover:text-slate-700">Reset</button>
              <div className="w-px h-5 bg-[#E5E7EB]" />
              <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="text-xs text-slate-500 hover:text-slate-700">+</button>
              <div className="w-px h-5 bg-[#E5E7EB]" />
              {step && (
                <button onClick={() => deleteStep(selectedIdx)}
                  className="text-red-400 hover:text-red-600 text-sm" title="Delete step">
                  🗑
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Right panel: callout editing ─────────────────────────────────── */}
        {step && callout && (
          <div className="w-72 bg-white border-l border-[#E5E7EB] flex flex-col flex-shrink-0 overflow-y-auto">
            <div className="p-4 border-b border-[#E5E7EB]">
              <h3 className="font-semibold text-sm text-[#0F172A]">Caption Box</h3>
              <p className="text-xs text-slate-400 mt-0.5">Edit the AI-generated caption</p>
            </div>
            <div className="p-4 space-y-4 flex-1">
              {/* Caption text */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Text</label>
                <textarea
                  className="w-full text-sm border border-[#E5E7EB] rounded-lg px-3 py-2 focus:outline-none focus:border-[#5B3DF5] resize-none"
                  rows={4}
                  value={callout.text}
                  onChange={(e) => updateStep({ callout: JSON.stringify({ ...callout, text: e.target.value }) })}
                />
              </div>

              {/* Font family */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Font</label>
                <select
                  className="w-full text-sm border border-[#E5E7EB] rounded-lg px-3 py-2 focus:outline-none focus:border-[#5B3DF5]"
                  value={callout.fontFamily}
                  onChange={(e) => updateStep({ callout: JSON.stringify({ ...callout, fontFamily: e.target.value }) })}>
                  {["Inter","Poppins","Roboto","Playfair Display","Lora","Montserrat","Open Sans","Comic Neue","Source Code Pro"].map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>

              {/* Font size + style */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Size & Style</label>
                <div className="flex items-center gap-2">
                  <input type="number" min={10} max={48}
                    className="w-16 text-sm border border-[#E5E7EB] rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#5B3DF5]"
                    value={callout.fontSize}
                    onChange={(e) => updateStep({ callout: JSON.stringify({ ...callout, fontSize: parseInt(e.target.value) || 15 }) })} />
                  <button
                    className={`w-8 h-8 rounded border text-sm font-bold ${callout.bold ? "bg-[#5B3DF5] text-white border-[#5B3DF5]" : "border-[#E5E7EB] text-slate-600"}`}
                    onClick={() => updateStep({ callout: JSON.stringify({ ...callout, bold: !callout.bold }) })}>B</button>
                  <button
                    className={`w-8 h-8 rounded border text-sm italic ${callout.italic ? "bg-[#5B3DF5] text-white border-[#5B3DF5]" : "border-[#E5E7EB] text-slate-600"}`}
                    onClick={() => updateStep({ callout: JSON.stringify({ ...callout, italic: !callout.italic }) })}>I</button>
                </div>
              </div>

              {/* Colors */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Text</label>
                  <input type="color" value={callout.textColor}
                    onChange={(e) => updateStep({ callout: JSON.stringify({ ...callout, textColor: e.target.value }) })}
                    className="w-full h-9 rounded-lg border border-[#E5E7EB] cursor-pointer" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Background</label>
                  <input type="color" value={callout.bgColor}
                    onChange={(e) => updateStep({ callout: JSON.stringify({ ...callout, bgColor: e.target.value }) })}
                    className="w-full h-9 rounded-lg border border-[#E5E7EB] cursor-pointer" />
                </div>
              </div>

              {/* Quick color presets */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Presets</label>
                <div className="flex gap-2 flex-wrap">
                  {["#5B3DF5","#0F172A","#16A34A","#DC2626","#F59E0B","#0EA5E9"].map(c => (
                    <button key={c} onClick={() => updateStep({ callout: JSON.stringify({ ...callout, bgColor: c }) })}
                      className="w-7 h-7 rounded-full border-2 border-white shadow"
                      style={{ background: c }} />
                  ))}
                </div>
              </div>

              {/* Arrow toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={callout.showArrow}
                  onChange={(e) => updateStep({ callout: JSON.stringify({ ...callout, showArrow: e.target.checked }) })}
                  className="accent-[#5B3DF5]" />
                <span className="text-sm text-slate-600">Show arrow</span>
              </label>

              {/* Placement */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Arrow direction</label>
                <div className="flex gap-1 flex-wrap">
                  {["auto","top","bottom","left","right"].map(p => (
                    <button key={p}
                      className={`px-2 py-1 rounded text-xs font-medium border ${callout.placement === p ? "bg-[#5B3DF5] text-white border-[#5B3DF5]" : "border-[#E5E7EB] text-slate-600 hover:border-[#5B3DF5]"}`}
                      onClick={() => updateStep({ callout: JSON.stringify({ ...callout, placement: p }) })}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Step actions */}
              <div className="border-t border-[#E5E7EB] pt-4 space-y-2">
                <button onClick={duplicateStep}
                  className="w-full text-sm py-2 border border-[#E5E7EB] rounded-lg hover:border-[#5B3DF5] text-slate-600">
                  Duplicate step
                </button>
                <button onClick={() => deleteStep(selectedIdx)}
                  className="w-full text-sm py-2 border border-red-200 rounded-lg hover:bg-red-50 text-red-500">
                  Delete step
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Share modal ──────────────────────────────────────────────────────── */}
      {shareOpen && (
        <ShareModal
          shareUrl={shareUrl}
          demo={demo}
          demoId={demoId}
          onClose={() => setShareOpen(false)}
          onPublishToggle={(pub) => setDemo(d => d ? { ...d, isPublished: pub } : d)}
        />
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AddStepButton({ idx, open, onToggle, demoId, steps, setSteps, setAddStepOpen }: any) {
  return (
    <div className="relative my-1">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-px border-t border-dashed border-slate-300" />
        <button onClick={onToggle}
          className="text-[#5B3DF5] text-xs font-semibold hover:bg-[#5B3DF5]/10 px-2 py-0.5 rounded whitespace-nowrap">
          + Add step
        </button>
        <div className="flex-1 h-px border-t border-dashed border-slate-300" />
      </div>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl border border-[#E5E7EB] shadow-xl p-2 z-50">
          <AddStepOption icon="🎬" title="Record more clicks" desc={`Opens the recorder${idx >= 0 ? ` after step ${idx + 1}` : ""}`}
            onClick={() => { setAddStepOpen(null); window.open(`/capture?demo=${demoId}&insertAfter=${idx}`, "_blank"); }} />
          <AddStepOption icon="🖼" title="Upload image" desc="Add a screenshot you already have"
            onClick={() => { setAddStepOpen(null); /* TODO: file picker */ alert("Coming soon: image upload"); }} />
          <AddStepOption icon="📖" title="Text or chapter card" desc="Intro, section title, or outro"
            onClick={() => {
              setAddStepOpen(null);
              const newStep = {
                id: `ch-${Date.now()}`, order: idx + 1, type: "chapter",
                title: "Chapter Title", description: "Add a subtitle here",
                snapshot: null, screenshotUrl: null, hotspots: "[]",
                pageUrl: null, pageTitle: null, clickX: null, clickY: null,
                callout: null, hotspot: null, blurs: null, annotations: null,
                crop: null, background: null, aiStatus: "done", videoUrl: null, duration: null,
              } as unknown as any;
              const newSteps = [
                ...steps.slice(0, idx + 1),
                newStep,
                ...steps.slice(idx + 1),
              ].map((s: any, i: number) => ({ ...s, order: i }));
              setSteps(newSteps);
            }} />
        </div>
      )}
    </div>
  );
}

function AddStepOption({ icon, title, desc, onClick }: any) {
  return (
    <button onClick={onClick}
      className="w-full text-left flex items-start gap-3 p-3 rounded-lg hover:bg-[#F4F5FB] transition-colors">
      <span className="text-xl">{icon}</span>
      <div>
        <p className="text-sm font-semibold text-[#0F172A]">{title}</p>
        <p className="text-xs text-slate-400">{desc}</p>
      </div>
    </button>
  );
}

function CalloutOverlay({ callout, canvasW, canvasH, editing, onEdit, onTextChange, onClose }: any) {
  const posX = Math.min(callout.x ?? 0, canvasW - (callout.width || 260) - 10);
  const posY = Math.min(callout.y ?? 0, canvasH - 120);

  return (
    <div
      className="absolute z-20 cursor-pointer"
      style={{ left: Math.max(0, posX), top: Math.max(0, posY), width: callout.width || 260 }}
      onClick={!editing ? onEdit : undefined}
    >
      {/* Arrow */}
      {callout.showArrow && (
        <div className="absolute -left-2 top-4 w-0 h-0"
          style={{ borderTop: "7px solid transparent", borderBottom: "7px solid transparent", borderRight: `9px solid ${callout.bgColor || "#5B3DF5"}` }} />
      )}
      <div className="rounded-2xl p-4 shadow-xl" style={{ background: callout.bgColor || "#5B3DF5" }}>
        {editing ? (
          <textarea
            autoFocus
            className="w-full bg-transparent text-white resize-none focus:outline-none text-sm"
            style={{
              fontFamily: callout.fontFamily, fontSize: callout.fontSize,
              fontWeight: callout.bold ? "bold" : "normal",
              fontStyle: callout.italic ? "italic" : "normal",
              color: callout.textColor || "#fff",
            }}
            rows={3}
            value={callout.text}
            onChange={(e) => onTextChange(e.target.value)}
            onBlur={onClose}
          />
        ) : (
          <p style={{
            fontFamily: callout.fontFamily, fontSize: callout.fontSize,
            fontWeight: callout.bold ? "bold" : "normal",
            fontStyle: callout.italic ? "italic" : "normal",
            color: callout.textColor || "#fff",
          }}>
            {callout.text || "Click to edit caption…"}
          </p>
        )}
        <div className="mt-3 flex items-center justify-between">
          <button className="text-xs underline" style={{ color: callout.textColor || "#fff" }}
            onClick={onEdit}>Edit</button>
          <div className="flex gap-1.5">
            <span className="w-6 h-6 rounded bg-white/20 flex items-center justify-center text-xs" style={{ color: callout.textColor || "#fff" }}>◀</span>
            <span className="w-6 h-6 rounded bg-white/20 flex items-center justify-center text-xs" style={{ color: callout.textColor || "#fff" }}>▶</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function HotspotPanel({ step, onUpdate }: any) {
  const hs = parseJson(step.hotspot ?? step.hotspots, null);
  return (
    <div className="mt-3 bg-white rounded-xl border border-[#E5E7EB] p-4 space-y-3">
      <h4 className="font-semibold text-sm">Hotspot</h4>
      {hs ? (
        <>
          <p className="text-xs text-slate-500">Shape: {hs.shape || "rect"} · Position: {Math.round(hs.x)}, {Math.round(hs.y)}</p>
          <div className="flex gap-2">
            {["rect","circle"].map(shape => (
              <button key={shape} onClick={() => onUpdate({ hotspot: JSON.stringify({ ...hs, shape }) })}
                className={`px-3 py-1 rounded text-xs border ${hs.shape === shape ? "bg-[#5B3DF5] text-white border-[#5B3DF5]" : "border-[#E5E7EB] text-slate-600"}`}>
                {shape}
              </button>
            ))}
          </div>
          <button onClick={() => onUpdate({ hotspot: null })}
            className="text-xs text-red-500 underline">Remove hotspot</button>
        </>
      ) : (
        <button onClick={() => onUpdate({ hotspot: JSON.stringify({ x: 100, y: 100, w: 120, h: 50, shape: "rect" }) })}
          className="text-sm text-[#5B3DF5] underline">+ Add hotspot</button>
      )}
    </div>
  );
}

function BlurPanel({ step, onUpdate, blurs }: any) {
  return (
    <div className="mt-3 bg-white rounded-xl border border-[#E5E7EB] p-4 space-y-2">
      <h4 className="font-semibold text-sm">Blur & Annotate</h4>
      <p className="text-xs text-slate-400">{blurs.length} blur area{blurs.length !== 1 ? "s" : ""}</p>
      <button onClick={() => onUpdate({ blurs: JSON.stringify([...blurs, { x: 10, y: 10, w: 20, h: 10 }]) })}
        className="text-sm text-[#5B3DF5] underline">+ Add blur area</button>
      {blurs.map((b: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-xs text-slate-500">
          <span>Blur {i + 1}: {b.w}%×{b.h}%</span>
          <button onClick={() => onUpdate({ blurs: JSON.stringify(blurs.filter((_: any, j: number) => j !== i)) })}
            className="text-red-400 ml-auto">✕</button>
        </div>
      ))}
    </div>
  );
}

function ChapterPanel({ step, onUpdate }: any) {
  return (
    <div className="mt-3 bg-white rounded-xl border border-[#E5E7EB] p-4 space-y-3">
      <h4 className="font-semibold text-sm">Chapter Card</h4>
      <div>
        <label className="block text-xs text-slate-500 mb-1">Chapter title</label>
        <input className="input w-full text-sm border border-[#E5E7EB] rounded-lg px-3 py-2 focus:outline-none focus:border-[#5B3DF5]"
          value={step.title || ""} onChange={(e) => onUpdate({ title: e.target.value, type: "chapter" })} />
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1">Subtitle</label>
        <input className="input w-full text-sm border border-[#E5E7EB] rounded-lg px-3 py-2 focus:outline-none focus:border-[#5B3DF5]"
          value={step.description || ""} onChange={(e) => onUpdate({ description: e.target.value })} />
      </div>
    </div>
  );
}

function EnhancePanel({ step, demoId, onUpdate, steps }: any) {
  const [loading, setLoading] = useState(false);

  async function rewrite(mode: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/steps/${step.id}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (data.caption) {
        const c = parseJson(step.callout, {} as any);
        onUpdate({ callout: JSON.stringify({ ...c, text: data.caption }), title: data.title || step.title, aiStatus: "done" });
      }
    } catch {}
    setLoading(false);
  }

  return (
    <div className="mt-3 bg-white rounded-xl border border-[#E5E7EB] p-4 space-y-2">
      <h4 className="font-semibold text-sm flex items-center gap-2">✨ Enhance with AI {loading && <span className="text-xs text-slate-400 animate-pulse">Working…</span>}</h4>
      {["Rewrite this step","Make friendlier","Make shorter","Translate to Spanish"].map(mode => (
        <button key={mode} onClick={() => rewrite(mode)}
          className="w-full text-left text-sm py-2 px-3 rounded-lg border border-[#E5E7EB] hover:border-[#5B3DF5] hover:text-[#5B3DF5] transition-colors">
          {mode}
        </button>
      ))}
    </div>
  );
}

// ─── AvatarPanel ─────────────────────────────────────────────────────────────
function AvatarPanel({ step, demo, onUpdate }: any) {
  const [avatarImageUrl, setAvatarImageUrl] = useState<string>(step.avatarImageUrl || "");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [polling, setPolling] = useState(false);
  const [didKey, setDidKey] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Check D-ID key on mount
  useEffect(() => {
    // We'll find out if the key is set when we try to generate
    // Keep it simple — just show the UI
    setDidKey(true);
  }, []);

  // Sync when step changes
  useEffect(() => {
    setAvatarImageUrl(step.avatarImageUrl || "");
    setGenError("");
    // If status is generating, start polling
    if (step.avatarStatus === "generating") {
      startPolling();
    }
  }, [step.id]);

  // Clean up poll on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  function startPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    setPolling(true);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/avatar/status?stepId=${step.id}`);
        const data = await res.json();
        if (data.status === "done") {
          clearInterval(pollRef.current!);
          setPolling(false);
          onUpdate({ avatarVideoUrl: data.videoUrl, avatarStatus: "done" });
        } else if (data.status === "failed") {
          clearInterval(pollRef.current!);
          setPolling(false);
          setGenError(data.error || "Avatar generation failed");
          onUpdate({ avatarStatus: "failed" });
        }
      } catch {}
    }, 4000); // poll every 4 seconds
  }

  async function uploadAvatar(file: File) {
    setUploading(true); setUploadError("");
    try {
      const fd = new FormData();
      fd.append("demoId", demo.id);
      fd.append("file", file, file.name);
      const res = await fetch("/api/avatar/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setUploadError(data.error || "Upload failed"); return; }
      setAvatarImageUrl(data.imageUrl);
      onUpdate({ avatarImageUrl: data.imageUrl });
    } catch (e: any) {
      setUploadError("Upload failed: " + e.message);
    } finally {
      setUploading(false);
    }
  }

  async function generateAvatar() {
    if (!avatarImageUrl) { setGenError("Upload an avatar photo first"); return; }
    if (!step.voiceScript && !step.title) { setGenError("Add a voiceover script or caption first"); return; }
    setGenerating(true); setGenError("");
    onUpdate({ avatarStatus: "generating" });
    try {
      const res = await fetch("/api/avatar/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stepId: step.id,
          avatarImageUrl: avatarImageUrl.startsWith("http")
            ? avatarImageUrl
            : `${window.location.origin}${avatarImageUrl}`,
          voiceAudioUrl: step.voiceAudioUrl
            ? step.voiceAudioUrl.startsWith("http")
              ? step.voiceAudioUrl
              : `${window.location.origin}${step.voiceAudioUrl}`
            : undefined,
          text: step.voiceScript || step.title,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenError(data.error || "Generation failed");
        onUpdate({ avatarStatus: "none" });
        return;
      }
      onUpdate({ avatarTalkId: data.talkId, avatarStatus: "generating" });
      startPolling();
    } catch (e: any) {
      setGenError("Request failed: " + e.message);
      onUpdate({ avatarStatus: "none" });
    } finally {
      setGenerating(false);
    }
  }

  function resetAvatar() {
    if (pollRef.current) clearInterval(pollRef.current);
    setPolling(false);
    onUpdate({ avatarVideoUrl: null, avatarStatus: "none", avatarTalkId: null });
  }

  const isGenerating = generating || polling || step.avatarStatus === "generating";
  const isDone = step.avatarStatus === "done" && step.avatarVideoUrl;
  const hasVoice = !!(step.voiceAudioUrl || step.voiceScript);

  return (
    <div className="mt-3 bg-white rounded-2xl border border-[#E5E7EB] shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#E5E7EB] flex items-center gap-3">
        <span className="text-2xl">🧑‍💼</span>
        <div>
          <h4 className="font-semibold text-sm text-[#0F172A]">AI Talking Avatar</h4>
          <p className="text-xs text-slate-400 mt-0.5">
            Turn this step into a video of a talking presenter
          </p>
        </div>
      </div>

      <div className="p-5 space-y-5">

        {/* How it works banner */}
        <div className="bg-[#5B3DF5]/5 border border-[#5B3DF5]/20 rounded-xl p-3 flex gap-3">
          <span className="text-lg">ℹ️</span>
          <p className="text-xs text-slate-600 leading-relaxed">
            Upload a <strong>face photo</strong> → it becomes the presenter.
            The avatar lip-syncs your <strong>voiceover</strong> (or caption text).
            The result is a <strong>talking-head video</strong> that replaces the screenshot in the player.
          </p>
        </div>

        {/* Step 1 — Avatar photo */}
        <div className={`rounded-xl border p-4 space-y-3 ${avatarImageUrl ? "border-green-200 bg-green-50" : "border-[#E5E7EB]"}`}>
          <div className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${avatarImageUrl ? "bg-green-500" : "bg-[#5B3DF5]"}`}>
              {avatarImageUrl ? "✓" : "1"}
            </span>
            <span className="text-sm font-semibold text-[#0F172A]">Avatar photo</span>
            {avatarImageUrl && (
              <button onClick={() => fileRef.current?.click()} className="ml-auto text-xs text-slate-400 hover:text-[#5B3DF5] underline">
                Change
              </button>
            )}
          </div>

          {avatarImageUrl ? (
            <div className="flex items-center gap-3">
              <img
                src={avatarImageUrl.startsWith("http") ? avatarImageUrl : avatarImageUrl}
                alt="avatar"
                className="w-16 h-16 rounded-xl object-cover border-2 border-green-300"
              />
              <div>
                <p className="text-xs font-medium text-green-700">✓ Photo uploaded</p>
                <p className="text-xs text-slate-400 mt-0.5">This face will be animated</p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-500">
                Upload a clear front-facing photo (JPEG/PNG/WebP, max 5 MB). One face only.
              </p>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-[#5B3DF5]/40 hover:border-[#5B3DF5] rounded-xl text-sm font-medium text-[#5B3DF5] hover:bg-[#5B3DF5]/5 transition-colors disabled:opacity-60"
              >
                {uploading ? <><span className="animate-spin">⏳</span> Uploading…</> : <>📸 Upload avatar photo</>}
              </button>
              {uploadError && <p className="text-xs text-red-500">⚠ {uploadError}</p>}
            </>
          )}

          <input ref={fileRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); e.target.value = ""; }}
          />
        </div>

        {/* Step 2 — Voice / script status */}
        <div className={`rounded-xl border p-4 ${hasVoice ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${hasVoice ? "bg-green-500" : "bg-amber-500"}`}>
              {hasVoice ? "✓" : "2"}
            </span>
            <span className="text-sm font-semibold text-[#0F172A]">Voice / script</span>
          </div>
          {hasVoice ? (
            <div className="mt-2 space-y-1">
              {step.voiceAudioUrl && <p className="text-xs text-green-700">✓ ElevenLabs voice audio ready — avatar will lip-sync this</p>}
              {!step.voiceAudioUrl && step.voiceScript && <p className="text-xs text-green-700">✓ Script ready: "{step.voiceScript.slice(0, 60)}…"</p>}
            </div>
          ) : (
            <p className="text-xs text-amber-700 mt-2">
              ⚠ No voiceover yet. Use <strong>Voiceover</strong> tab to generate audio first, or the caption text will be used.
              {step.title && <span className="block mt-1 text-slate-500">Will use caption: "{step.title}"</span>}
            </p>
          )}
        </div>

        {/* Step 3 — Generate */}
        <div className="space-y-3">
          {!isDone && (
            <button
              onClick={generateAvatar}
              disabled={!avatarImageUrl || isGenerating}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#5B3DF5] hover:bg-[#4C2FE0] disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition-colors"
            >
              {isGenerating ? (
                <><span className="animate-spin inline-block">⏳</span> Generating avatar video… (takes ~30s)</>
              ) : (
                <><span>🎬</span> Generate talking avatar video</>
              )}
            </button>
          )}

          {isGenerating && (
            <div className="bg-[#F4F5FB] rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#5B3DF5] animate-pulse" />
                <p className="text-xs text-slate-600 font-medium">Rendering avatar video…</p>
              </div>
              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-[#5B3DF5] rounded-full animate-pulse" style={{ width: "60%" }} />
              </div>
              <p className="text-xs text-slate-400">D-ID is processing — usually takes 20–60 seconds</p>
            </div>
          )}

          {genError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-xs text-red-600">⚠ {genError}</p>
              {genError.includes("DID_API_KEY") && (
                <p className="text-xs text-slate-500 mt-1">
                  Add <code className="bg-slate-100 px-1 rounded">DID_API_KEY=your_key</code> to <code>.env</code>.
                  Get a free key at <a href="https://www.d-id.com" target="_blank" className="text-[#5B3DF5] underline">d-id.com</a>
                </p>
              )}
            </div>
          )}
        </div>

        {/* Result — video player */}
        {isDone && step.avatarVideoUrl && (
          <div className="rounded-xl border border-green-200 bg-green-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-green-200 flex items-center justify-between">
              <span className="text-sm font-semibold text-green-800 flex items-center gap-2">
                🎉 Avatar video ready!
              </span>
              <div className="flex gap-2">
                <a href={step.avatarVideoUrl} download
                  className="text-xs text-[#5B3DF5] hover:underline font-medium">⬇ Download</a>
                <button onClick={resetAvatar} className="text-xs text-slate-400 hover:text-red-500 ml-2">
                  Regenerate
                </button>
              </div>
            </div>
            <video
              src={step.avatarVideoUrl}
              controls autoPlay loop
              className="w-full bg-black"
              style={{ maxHeight: 240 }}
            />
            <p className="text-xs text-slate-400 p-3">
              This video now shows in the step canvas above and in the player/preview.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── VoiceoverPanel ───────────────────────────────────────────────────────────
function VoiceoverPanel({ step, demo, onUpdate, onDemoUpdate }: any) {
  const [script, setScript] = useState<string>(
    step.voiceScript ?? (step.callout ? (() => { try { return JSON.parse(step.callout).text || ""; } catch { return ""; } })() : (step.title || ""))
  );
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [cloning, setCloning] = useState(false);
  const [cloneError, setCloneError] = useState("");
  const [voiceName, setVoiceName] = useState(demo.clonedVoiceName || "");
  const [audioKey, setAudioKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  // Keep script in sync when step changes
  useEffect(() => {
    setScript(
      step.voiceScript ??
      (step.callout ? (() => { try { return JSON.parse(step.callout).text || ""; } catch { return ""; } })() : (step.title || ""))
    );
    setGenError("");
  }, [step.id]);

  async function generate() {
    if (!script.trim()) { setGenError("Enter a script first"); return; }
    setGenerating(true); setGenError("");
    try {
      const res = await fetch("/api/voice/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stepId: step.id,
          text: script.trim(),
          voiceId: demo.clonedVoiceId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setGenError(data.error || "Generation failed"); return; }
      // Update local step state so player appears without reload
      onUpdate({ voiceScript: script.trim(), voiceAudioUrl: data.audioUrl, voiceStatus: "done" });
      setAudioKey(k => k + 1);
    } catch (e: any) {
      setGenError("Network error: " + e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function cloneVoice(file: File) {
    if (!voiceName.trim()) { setCloneError("Enter a name for the cloned voice"); return; }
    setCloning(true); setCloneError("");
    try {
      const fd = new FormData();
      fd.append("demoId", demo.id);
      fd.append("voiceName", voiceName.trim());
      fd.append("audioFile", file, file.name);
      const res = await fetch("/api/voice/clone", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setCloneError(data.error || "Cloning failed"); return; }
      onDemoUpdate({ clonedVoiceId: data.voiceId, clonedVoiceName: data.voiceName });
    } catch (e: any) {
      setCloneError("Network error: " + e.message);
    } finally {
      setCloning(false);
    }
  }

  const audioUrl = step.voiceAudioUrl;
  const hasClone = !!demo.clonedVoiceId;

  return (
    <div className="mt-3 bg-white rounded-2xl border border-[#E5E7EB] shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#E5E7EB] flex items-center gap-2">
        <span className="text-lg">🎙️</span>
        <div>
          <h4 className="font-semibold text-sm text-[#0F172A]">Voiceover</h4>
          <p className="text-xs text-slate-400">Generate AI narration in a cloned voice for this step</p>
        </div>
      </div>

      <div className="p-5 space-y-5">

        {/* ── STEP 1: Clone voice ── */}
        <div className={`rounded-xl border p-4 space-y-3 ${hasClone ? "border-green-200 bg-green-50" : "border-[#E5E7EB]"}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${hasClone ? "bg-green-500" : "bg-[#5B3DF5]"}`}>
                {hasClone ? "✓" : "1"}
              </span>
              <span className="text-sm font-semibold text-[#0F172A]">
                {hasClone ? `Voice: "${demo.clonedVoiceName}"` : "Upload your voice sample"}
              </span>
            </div>
            {hasClone && (
              <button
                onClick={() => fileRef.current?.click()}
                className="text-xs text-slate-400 hover:text-[#5B3DF5] underline"
              >
                Replace
              </button>
            )}
          </div>

          {!hasClone && (
            <>
              <p className="text-xs text-slate-500 leading-relaxed">
                Record yourself speaking for <strong>at least 30 seconds</strong>, then upload. ElevenLabs will clone your voice and use it for all steps in this demo.
              </p>

              {/* Voice name */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Voice name</label>
                <input
                  className="w-full text-sm border border-[#E5E7EB] rounded-lg px-3 py-2 focus:outline-none focus:border-[#5B3DF5]"
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                  placeholder="e.g. John's Voice"
                />
              </div>

              {/* Upload button */}
              <button
                onClick={() => fileRef.current?.click()}
                disabled={cloning}
                className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-[#5B3DF5]/40 hover:border-[#5B3DF5] rounded-xl text-sm font-medium text-[#5B3DF5] hover:bg-[#5B3DF5]/5 transition-colors disabled:opacity-60"
              >
                {cloning
                  ? <><span className="animate-spin">⏳</span> Cloning voice…</>
                  : <><span>🎤</span> Upload voice sample (MP3 / WAV / M4A)</>}
              </button>

              {cloneError && (
                <p className="text-xs text-red-500">⚠ {cloneError}</p>
              )}
            </>
          )}

          {hasClone && (
            <p className="text-xs text-green-700">
              ✓ Cloned voice ready. All generated audio for this demo will use it.
            </p>
          )}

          {/* Hidden file input */}
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) cloneVoice(file);
              e.target.value = "";
            }}
          />
        </div>

        {/* ── STEP 2: Script ── */}
        <div className="rounded-xl border border-[#E5E7EB] p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#5B3DF5] flex items-center justify-center text-xs font-bold text-white">2</span>
            <span className="text-sm font-semibold text-[#0F172A]">Script — what to say</span>
          </div>

          <textarea
            className="w-full text-sm border border-[#E5E7EB] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#5B3DF5] resize-none leading-relaxed"
            rows={5}
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder="Type what the voice should say for this step…&#10;&#10;Tip: it's pre-filled from the caption. Edit freely."
          />

          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">{script.length} chars · ~{Math.max(1, Math.round(script.split(" ").length / 2))}s audio</span>
            <button
              onClick={() => {
                try {
                  const c = JSON.parse(step.callout || "{}");
                  if (c.text) setScript(c.text);
                } catch {}
              }}
              className="text-xs text-[#5B3DF5] hover:underline"
            >
              ↩ Restore from caption
            </button>
          </div>
        </div>

        {/* ── STEP 3: Generate ── */}
        <div className="space-y-3">
          <button
            onClick={generate}
            disabled={generating || !script.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 bg-[#5B3DF5] hover:bg-[#4C2FE0] disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            {generating
              ? <><span className="animate-spin inline-block">⏳</span> Generating audio…</>
              : <><span>🔊</span> Generate voice audio</>}
          </button>

          {genError && <p className="text-xs text-red-500 text-center">⚠ {genError}</p>}

          {!hasClone && !generating && (
            <p className="text-xs text-slate-400 text-center">
              No clone yet — will use ElevenLabs default voice. Upload a sample above to use your own.
            </p>
          )}
        </div>

        {/* ── Audio player ── */}
        {audioUrl && (
          <div className="rounded-xl border border-[#E5E7EB] bg-[#F4F5FB] p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#0F172A] flex items-center gap-1.5">
                <span>🔊</span> Generated audio
                <span className="text-green-500 font-medium">✓ Ready</span>
              </span>
              <a href={audioUrl} download className="text-xs text-[#5B3DF5] hover:underline">⬇ Download</a>
            </div>
            <audio key={audioKey} controls src={audioUrl} className="w-full h-9 rounded-lg" />
            <p className="text-xs text-slate-400 italic truncate">"{script}"</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ShareModal({ shareUrl, demo, demoId, onClose, onPublishToggle }: any) {
  const [copied, setCopied] = useState(false);
  const [published, setPublished] = useState(demo.isPublished);
  const embedCode = `<iframe src="${shareUrl}" width="100%" height="500" frameborder="0"></iframe>`;

  async function togglePublish() {
    const next = !published;
    setPublished(next);
    onPublishToggle(next);
    await fetch(`/api/demos/${demoId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublished: next }),
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[#0F172A]">Share demo</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl">✕</button>
        </div>

        {/* Publish toggle */}
        <label className="flex items-center justify-between mb-4 cursor-pointer">
          <span className="text-sm font-medium text-slate-700">Anyone with the link can view</span>
          <div className={`w-12 h-6 rounded-full transition-colors ${published ? "bg-[#5B3DF5]" : "bg-slate-300"}`}
            onClick={togglePublish}>
            <div className={`w-5 h-5 bg-white rounded-full shadow m-0.5 transition-transform ${published ? "translate-x-6" : ""}`} />
          </div>
        </label>

        {/* Link */}
        <div className="flex gap-2 mb-4">
          <input readOnly value={shareUrl}
            className="flex-1 text-sm border border-[#E5E7EB] rounded-lg px-3 py-2 bg-slate-50 text-slate-600" />
          <button
            onClick={() => { navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="bg-[#5B3DF5] hover:bg-[#4C2FE0] text-white text-sm font-semibold px-4 py-2 rounded-lg">
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>

        {/* Embed + download */}
        <div className="flex gap-2">
          <button
            onClick={() => { navigator.clipboard.writeText(embedCode); setCopied(true); }}
            className="flex-1 border border-[#E5E7EB] rounded-lg py-2 text-sm text-slate-600 hover:border-slate-400">
            Embed code
          </button>
          <a href={`/api/demos/${demoId}/export/video`}
            className="flex-1 border border-[#E5E7EB] rounded-lg py-2 text-sm text-slate-600 hover:border-slate-400 text-center">
            Download video
          </a>
        </div>
      </div>
    </div>
  );
}
