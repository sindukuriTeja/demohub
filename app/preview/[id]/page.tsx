"use client";
import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

function parseJson<T>(s: string | null | undefined, fb: T): T {
  if (!s) return fb;
  try { return JSON.parse(s); } catch { return fb; }
}

function getImgSrc(step: any): string {
  if (step.screenshotUrl) return step.screenshotUrl;
  if (step.snapshot) {
    const m = step.snapshot.match(/src="([^"]+)"/);
    if (m) return m[1];
  }
  return "";
}

export default function PreviewPage() {
  const params = useParams();
  const router = useRouter();
  const demoId = params.id as string;

  const [demo, setDemo] = useState<any>(null);
  const [steps, setSteps] = useState<any[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const playTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetch(`/api/demos/${demoId}`)
      .then(r => r.json())
      .then(d => {
        setDemo(d);
        const sorted = [...(d.steps || [])].sort((a: any, b: any) => a.order - b.order);
        setSteps(sorted);
        setLoading(false);
      });
  }, [demoId]);

  useEffect(() => {
    if (!playing) { if (playTimer.current) clearInterval(playTimer.current); return; }
    const dur = (demo?.stepDurationSec || 3) * 1000;
    playTimer.current = setInterval(() => {
      setCurrentIdx(i => {
        if (i >= steps.length - 1) { setPlaying(false); return i; }
        return i + 1;
      });
    }, dur);
    return () => { if (playTimer.current) clearInterval(playTimer.current); };
  }, [playing, steps.length, demo?.stepDurationSec]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setCurrentIdx(i => Math.min(i + 1, steps.length - 1));
      if (e.key === "ArrowLeft") setCurrentIdx(i => Math.max(i - 1, 0));
      if (e.key === " ") { e.preventDefault(); setPlaying(p => !p); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [steps.length]);

  if (loading) return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
      <div className="text-white text-center"><div className="text-4xl animate-pulse mb-3">▶</div><p>Loading…</p></div>
    </div>
  );

  const step = steps[currentIdx];
  const callout = parseJson(step?.callout, null) as any;
  const hotspot = parseJson(step?.hotspot ?? step?.hotspots, null) as any;
  const imgSrc = step ? getImgSrc(step) : "";
  const isLast = currentIdx === steps.length - 1;

  return (
    <div className="min-h-screen bg-[#0F172A] flex flex-col text-white" style={{ fontFamily: "Inter, sans-serif" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4">
        <h1 className="font-semibold text-white">{demo?.title}</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400">{currentIdx + 1} / {steps.length}</span>
          <button onClick={() => router.push(`/editor/${demoId}`)} className="text-slate-400 hover:text-white text-sm">✕</button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex items-center justify-center px-6 pb-6">
        <div className="w-full max-w-4xl">
          {/* Browser frame */}
          <div className="rounded-2xl overflow-hidden border border-slate-700 shadow-2xl">
            <div className="bg-[#1E293B] px-4 py-2.5 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <div className="flex-1 mx-4">
                <div className="bg-slate-700 rounded-full px-4 py-1 text-xs text-slate-400 text-center truncate">
                  {step?.pageUrl || "about:blank"}
                </div>
              </div>
            </div>

            <div className="relative bg-slate-900" style={{ aspectRatio: "16/9" }}>
              {imgSrc ? (
                <img src={imgSrc} alt="step" className="absolute inset-0 w-full h-full object-cover object-top" />
              ) : step?.type === "chapter" ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#5B3DF5] to-[#7C5CFF] p-8 text-center">
                  <h2 className="text-2xl font-bold text-white mb-2">{step.title}</h2>
                  <p className="text-indigo-200">{step.description}</p>
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-slate-600 text-4xl">📋</div>
              )}

              {/* Hotspot pulse */}
              {hotspot && (
                <div className="absolute rounded-lg border-2 border-[#5B3DF5]"
                  style={{
                    left: `${(hotspot.x / 1280) * 100}%`,
                    top: `${(hotspot.y / 720) * 100}%`,
                    width: `${(hotspot.w / 1280) * 100}%`,
                    height: `${(hotspot.h / 720) * 100}%`,
                    animation: "pulse 1.8s ease-in-out infinite",
                    background: "rgba(91,61,245,0.15)",
                  }} />
              )}

              {/* Callout */}
              {callout && (
                <div className="absolute bottom-6 right-6 max-w-xs rounded-2xl p-4 shadow-xl"
                  style={{ background: callout.bgColor || "#5B3DF5", fontFamily: callout.fontFamily || "Inter" }}>
                  <p className="text-sm mb-3" style={{
                    color: callout.textColor || "#fff",
                    fontWeight: callout.bold ? "bold" : "normal",
                    fontStyle: callout.italic ? "italic" : "normal",
                    fontSize: callout.fontSize || 15,
                  }}>
                    {callout.text}
                  </p>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setCurrentIdx(i => Math.max(i - 1, 0))}
                      className="w-7 h-7 rounded bg-white/20 flex items-center justify-center text-xs hover:bg-white/30"
                      style={{ color: callout.textColor || "#fff" }}>◀</button>
                    <button onClick={() => setCurrentIdx(i => Math.min(i + 1, steps.length - 1))}
                      className="w-7 h-7 rounded bg-white/20 flex items-center justify-center text-xs hover:bg-white/30"
                      style={{ color: callout.textColor || "#fff" }}>▶</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex-shrink-0 px-6 pb-6 space-y-3">
        {/* Progress bar */}
        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div className="h-full bg-[#5B3DF5] transition-all duration-300"
            style={{ width: `${((currentIdx + 1) / steps.length) * 100}%` }} />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setPlaying(p => !p)}
              className="w-10 h-10 rounded-full bg-[#5B3DF5] hover:bg-[#4C2FE0] flex items-center justify-center text-white">
              {playing ? "⏸" : "▶"}
            </button>
            <button onClick={() => setCurrentIdx(i => Math.max(i - 1, 0))} disabled={currentIdx === 0}
              className="px-4 py-2 rounded-lg border border-slate-600 text-sm disabled:opacity-40 hover:border-slate-400">
              ← Back
            </button>
            <button onClick={() => setCurrentIdx(i => Math.min(i + 1, steps.length - 1))} disabled={isLast}
              className="px-4 py-2 rounded-lg border border-slate-600 text-sm disabled:opacity-40 hover:border-slate-400">
              Next →
            </button>
          </div>

          {isLast && (
            <div className="flex gap-3">
              <button onClick={() => setCurrentIdx(0)}
                className="px-4 py-2 rounded-lg border border-slate-600 text-sm hover:border-slate-400">
                Replay
              </button>
            </div>
          )}

          {/* Step dots */}
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <button key={i} onClick={() => setCurrentIdx(i)}
                className={`rounded-full transition-all ${i === currentIdx ? "w-6 h-2 bg-[#5B3DF5]" : "w-2 h-2 bg-slate-600 hover:bg-slate-500"}`} />
            ))}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(91,61,245,0.4); }
          50% { box-shadow: 0 0 0 8px rgba(91,61,245,0); }
        }
      `}</style>
    </div>
  );
}
