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
}

interface Demo {
  id: string; title: string; description: string | null;
  status: string; stepDurationSec: number; shareToken: string;
  isPublished: boolean; steps: Step[];
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
        {["Hotspot", "Blur & annotate", "Chapter", "Enhance with AI"].map(tool => (
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
                    {imgSrc ? (
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
