"use client";
import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

interface StepThumb {
  id: string;
  position: number;
  thumbUrl: string;
  title: string;
  caption: string;
}
interface ClickRing {
  id: string;
  x: number;
  y: number;
  ts: number;
}
interface CaptionBubble {
  id: string;
  x: number;
  y: number;
  text: string;
  ts: number;
}

function CapturePageInner() {
  const params = useSearchParams();
  const router = useRouter();
  const demoId = params.get("demo");
  const insertAfter = params.get("insertAfter");

  // Setup phase state
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState("");
  const [viewport, setViewport] = useState("1280x720");
  const [rememberLogin, setRememberLogin] = useState(true);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");

  // Recording phase state
  const [phase, setPhase] = useState<"setup" | "recording" | "done">("setup");
  const [status, setStatus] = useState<"recording" | "paused" | "stopping">("recording");
  const [liveUrl, setLiveUrl] = useState("");
  const [liveTitle, setLiveTitle] = useState("");
  const [urlBarValue, setUrlBarValue] = useState("");
  const [stepCount, setStepCount] = useState(0);
  const [steps, setSteps] = useState<StepThumb[]>([]);
  const [clickRings, setClickRings] = useState<ClickRing[]>([]);
  const [captionBubbles, setCaptionBubbles] = useState<CaptionBubble[]>([]);
  const [toasts, setToasts] = useState<{ id: string; text: string }[]>([]);
  const [sensitiveOpen, setSensitiveOpen] = useState(false);
  const [wsToken, setWsToken] = useState("");
  const [wsUrl, setWsUrl] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const filmstripRef = useRef<HTMLDivElement>(null);
  const lastMouseMove = useRef(0);
  const reconnectAttempts = useRef(0);
  const manuallyClosed = useRef(false);
  const phaseRef = useRef<"setup" | "recording" | "done">("setup");
  const [vpDims, setVpDims] = useState({ w: 1280, h: 720 });

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Toast helper
  const addToast = useCallback((text: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }, []);

  // Parse viewport
  useEffect(() => {
    const [w, h] = viewport.split("x").map(Number);
    setVpDims({ w: w || 1280, h: h || 720 });
  }, [viewport]);

  // Connect WebSocket
  const connect = useCallback(
    (targetWsUrl: string, token: string) => {
      const ws = new WebSocket(`${targetWsUrl}?token=${token}`);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onmessage = (e) => {
        if (e.data instanceof ArrayBuffer) {
          // Binary = JPEG frame
          const blob = new Blob([e.data], { type: "image/jpeg" });
          const objUrl = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => {
            const canvas = canvasRef.current;
            if (!canvas) {
              URL.revokeObjectURL(objUrl);
              return;
            }
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              URL.revokeObjectURL(objUrl);
              return;
            }
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(objUrl);
          };
          img.src = objUrl;
          return;
        }
        // JSON message
        let msg: any;
        try {
          msg = JSON.parse(e.data);
        } catch {
          return;
        }

        switch (msg.type) {
          case "state":
            if (msg.url) {
              setLiveUrl(msg.url);
              setUrlBarValue(msg.url);
            }
            if (msg.title) setLiveTitle(msg.title);
            if (msg.status) setStatus(msg.status);
            if (typeof msg.stepCount === "number") setStepCount(msg.stepCount);
            if (msg.status === "closed" || msg.status === "stopping") {
              if (msg.reason === "stopped") {
                manuallyClosed.current = true;
                setPhase("done");
                setTimeout(() => router.push(`/editor/${demoId}`), 1500);
              }
            }
            break;
          case "step_created":
            setStepCount(msg.stepCount ?? ((c: number) => c + 1));
            setSteps((prev) => [
              ...prev,
              {
                id: msg.id,
                position: msg.position,
                thumbUrl: msg.thumbUrl,
                title: msg.title,
                caption: msg.callout || "Writing caption…",
              },
            ]);
            // Show click ring + bubble at the recorded click location
            if (msg.clickX !== undefined && msg.clickY !== undefined && canvasRef.current) {
              const canvas = canvasRef.current;
              const cx = (msg.clickX || 0) * (canvas.width / vpDims.w);
              const cy = (msg.clickY || 0) * (canvas.height / vpDims.h);
              const rid = Math.random().toString(36).slice(2);
              setClickRings((r) => [...r, { id: rid, x: cx, y: cy, ts: Date.now() }]);
              setTimeout(() => setClickRings((r) => r.filter((x) => x.id !== rid)), 700);
              const bid = msg.id;
              setCaptionBubbles((b) => [
                ...b,
                { id: bid, x: cx, y: cy, text: msg.callout || "Writing caption…", ts: Date.now() },
              ]);
            }
            // Auto-scroll filmstrip
            setTimeout(() => filmstripRef.current?.scrollTo({ top: 99999, behavior: "smooth" }), 100);
            break;
          case "step_caption":
            setSteps((prev) => prev.map((s) => (s.id === msg.id ? { ...s, caption: msg.caption } : s)));
            setCaptionBubbles((prev) =>
              prev.map((b) => (b.id === msg.id ? { ...b, text: msg.caption } : b))
            );
            // Auto-remove caption bubble after a few seconds
            setTimeout(() => setCaptionBubbles((prev) => prev.filter((b) => b.id !== msg.id)), 4000);
            break;
          case "cursor":
            if (canvasRef.current) canvasRef.current.style.cursor = msg.cursor || "default";
            break;
          case "toast":
            addToast(msg.text);
            break;
          case "stopped":
            manuallyClosed.current = true;
            setPhase("done");
            setTimeout(() => router.push(`/editor/${msg.demoId || demoId}`), 1500);
            break;
          case "undo_ok":
            setSteps((prev) => prev.slice(0, -1));
            addToast("Last step removed");
            break;
          case "error":
            addToast(`Error: ${msg.message}`);
            break;
        }
      };

      ws.onclose = () => {
        if (manuallyClosed.current) return;
        if (reconnectAttempts.current < 5 && phaseRef.current === "recording") {
          reconnectAttempts.current++;
          setTimeout(() => connect(targetWsUrl, token), 1000 * reconnectAttempts.current);
        }
      };

      ws.onerror = () => {};
    },
    [demoId, router, vpDims.w, vpDims.h, addToast]
  );

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  // Canvas mouse/keyboard input → map display coords to viewport coords
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width) * (vpDims.w / canvas.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height) * (vpDims.h / canvas.height),
    };
  };

  const send = (obj: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(obj));
    }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 || status === "paused") return;
    const { x, y } = getCanvasCoords(e);
    send({ type: "mousedown", x, y });
  };
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const now = Date.now();
    if (now - lastMouseMove.current < 30) return;
    lastMouseMove.current = now;
    const { x, y } = getCanvasCoords(e);
    send({ type: "mousemove", x, y });
  };
  const handleCanvasWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    send({ type: "wheel", deltaX: e.deltaX, deltaY: e.deltaY });
  };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const special = [
      "Enter", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
      "Backspace", "Escape", "Delete",
    ];
    if (special.includes(e.key) || e.ctrlKey || e.metaKey) {
      e.preventDefault();
      send({ type: "keydown", key: e.key });
    } else if (e.key.length === 1) {
      e.preventDefault();
      send({ type: "text", text: e.key });
    }
  };

  // Start recording
  async function startRecording() {
    setUrlError("");
    setStartError("");
    let finalUrl = url.trim();
    if (!finalUrl) {
      setUrlError("Enter a valid website address");
      return;
    }
    if (!finalUrl.startsWith("http")) finalUrl = `https://${finalUrl}`;
    try {
      new URL(finalUrl);
    } catch {
      setUrlError("Enter a valid website address");
      return;
    }

    if (!demoId) {
      setStartError("No demo ID. Go back and create a demo first.");
      return;
    }

    setStarting(true);
    try {
      const res = await fetch("/api/recorder/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demoId, url: finalUrl, viewport, rememberLogin, insertAfter }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStartError(data.error || "Failed to start");
        setStarting(false);
        return;
      }

      setWsToken(data.token);
      setWsUrl(data.wsUrl);
      setPhase("recording");
      phaseRef.current = "recording";
      manuallyClosed.current = false;
      reconnectAttempts.current = 0;
      connect(data.wsUrl, data.token);
    } catch (e: any) {
      setStartError("Network error: " + e.message);
      setStarting(false);
    }
  }

  // Control actions
  const controlAction = (action: string) => send({ type: "control", action });

  const handleStop = () => {
    if (stepCount === 0) {
      addToast("No steps recorded yet");
      return;
    }
    manuallyClosed.current = true;
    controlAction("stop");
  };
  const handleCancel = () => {
    if (confirm(`Discard ${stepCount} step${stepCount !== 1 ? "s" : ""}?`)) {
      manuallyClosed.current = true;
      controlAction("cancel");
      router.push("/create");
    }
  };
  const handleNav = (action: string, navUrl?: string) => {
    send({ type: "nav", action, url: navUrl });
  };

  // Canvas sizing
  const canvasW = Math.min(vpDims.w, 900);
  const canvasH = Math.round((canvasW * vpDims.h) / vpDims.w);

  // ── SETUP PHASE ────────────────────────────────────────────────────────────
  if (phase === "setup") {
    return (
      <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md bg-[#1E293B] rounded-2xl p-8 space-y-6 shadow-2xl">
          <div className="text-center">
            <div className="text-4xl mb-2">🎬</div>
            <h1 className="text-xl font-bold text-white">DemoHub Screen Capture</h1>
            <p className="text-slate-400 text-sm mt-1">Enter your website, then start recording.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Website URL</label>
            <input
              autoFocus
              className={`w-full rounded-lg px-4 py-2.5 bg-slate-700 border text-white text-sm placeholder-slate-400 focus:outline-none focus:border-[#5B3DF5] ${
                urlError ? "border-red-500" : "border-slate-600"
              }`}
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setUrlError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && startRecording()}
              placeholder="https://your-app.com"
            />
            {urlError && <p className="text-red-400 text-xs mt-1">{urlError}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">Window size</label>
            <div className="flex flex-wrap gap-2">
              {[
                ["Desktop 1280x720", "1280x720"],
                ["Large 1440x900", "1440x900"],
                ["Tablet 820x1180", "820x1180"],
                ["Mobile 390x844", "390x844"],
              ].map(([label, val]) => (
                <button
                  key={val}
                  onClick={() => setViewport(val)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    viewport === val
                      ? "bg-[#5B3DF5] text-white"
                      : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={rememberLogin}
              onChange={(e) => setRememberLogin(e.target.checked)}
              className="w-4 h-4 accent-[#5B3DF5]"
            />
            <span className="text-sm text-slate-300">Remember my login so I can add steps later</span>
          </label>

          {startError && <p className="text-red-400 text-sm">{startError}</p>}

          <button
            onClick={startRecording}
            disabled={starting}
            className="w-full bg-[#5B3DF5] hover:bg-[#4C2FE0] disabled:opacity-60 py-3 rounded-xl text-sm font-bold text-white transition-colors flex items-center justify-center gap-2"
          >
            {starting ? (
              <>
                <span className="animate-spin">⏳</span> Opening your site…
              </>
            ) : (
              "Start recording →"
            )}
          </button>
        </div>
      </div>
    );
  }

  // ── DONE PHASE ──────────────────────────────────────────────────────────────
  if (phase === "done") {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-5xl animate-pulse">✨</div>
          <h2 className="text-xl font-bold text-white">Preparing your editor…</h2>
          <p className="text-slate-400 text-sm">{stepCount} steps recorded</p>
        </div>
      </div>
    );
  }

  // ── RECORDING PHASE ─────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col bg-[#0F172A] text-white overflow-hidden select-none">
      {/* Browser top bar */}
      <div className="flex-shrink-0 bg-[#1E293B] border-b border-slate-700 px-4 py-2 flex items-center gap-2">
        <span className="font-bold text-white text-sm mr-2">DemoHub</span>
        <button
          onClick={() => handleNav("back")}
          className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
          title="Back"
        >
          ◀
        </button>
        <button
          onClick={() => handleNav("forward")}
          className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
          title="Forward"
        >
          ▶
        </button>
        <button
          onClick={() => handleNav("reload")}
          className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
          title="Reload"
        >
          ↻
        </button>
        <input
          className="flex-1 mx-2 rounded-lg px-3 py-1.5 bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:border-[#5B3DF5]"
          value={urlBarValue}
          onChange={(e) => setUrlBarValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleNav("goto", urlBarValue);
          }}
        />
      </div>

      {/* Recorder controls bar */}
      <div className="flex-shrink-0 bg-[#0F172A] border-b border-slate-700/50 px-4 py-2 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div
            className={`w-3 h-3 rounded-full ${
              status === "paused" ? "bg-amber-400" : "bg-[#5B3DF5]"
            } animate-pulse`}
          />
          <span className="text-sm font-medium text-slate-200">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#5B3DF5]/20 text-[#5B3DF5] font-bold text-xs mr-1">
              {stepCount}
            </span>
            steps recorded
          </span>
        </div>

        <div className="flex-1" />

        <div className="relative">
          <button
            onClick={() => setSensitiveOpen((o) => !o)}
            className="px-3 py-1.5 rounded-lg border border-slate-600 text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-1.5"
          >
            🔒 Hide sensitive data
          </button>
          {sensitiveOpen && (
            <div className="absolute top-full right-0 mt-1 bg-[#1E293B] rounded-xl border border-slate-600 p-3 z-50 w-52 shadow-xl">
              <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-slate-700 rounded">
                <input type="radio" name="sensitive" defaultChecked className="accent-[#5B3DF5]" />
                <span className="text-sm text-slate-200">Auto-hide common fields</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-slate-700 rounded mt-1">
                <input type="radio" name="sensitive" className="accent-[#5B3DF5]" />
                <span className="text-sm text-slate-200">Pick elements to hide</span>
              </label>
            </div>
          )}
        </div>

        <button
          onClick={() => controlAction("capture_screen")}
          className="px-3 py-1.5 rounded-lg border border-slate-600 text-sm text-slate-300 hover:bg-slate-700"
        >
          📷 Capture screen
        </button>

        <button
          onClick={() => controlAction(status === "paused" ? "resume" : "pause")}
          className="px-3 py-1.5 rounded-lg border border-slate-600 text-sm text-slate-300 hover:bg-slate-700"
        >
          {status === "paused" ? "▶ Resume" : "⏸ Pause"}
        </button>

        <button
          onClick={handleStop}
          className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-sm font-semibold text-white"
        >
          ⏹ Stop recording
        </button>
      </div>

      {/* Cancel link */}
      <div className="flex-shrink-0 px-4 py-1">
        <button
          onClick={handleCancel}
          className="text-xs text-slate-500 hover:text-slate-300 underline"
        >
          Cancel recording
        </button>
        {status === "paused" && (
          <span className="ml-4 text-xs text-amber-400 font-medium">
            ⏸ Paused — site still usable, clicks not recorded
          </span>
        )}
      </div>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas area */}
        <div className="flex-1 flex items-center justify-center bg-[#0F172A] p-4 relative overflow-hidden">
          <div className="relative" style={{ width: canvasW, height: canvasH }}>
            <canvas
              ref={canvasRef}
              width={canvasW}
              height={canvasH}
              className="rounded-xl shadow-2xl bg-slate-800"
              style={{ display: "block", cursor: "default" }}
              tabIndex={0}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onWheel={handleCanvasWheel}
              onKeyDown={handleKeyDown}
            />

            {/* Click rings */}
            {clickRings.map((ring) => (
              <div
                key={ring.id}
                className="absolute pointer-events-none"
                style={{ left: ring.x - 22, top: ring.y - 22, width: 44, height: 44 }}
              >
                <div className="w-full h-full rounded-full border-4 border-[#5B3DF5]" style={{ animation: "dh-pulse-ring 0.7s ease-out" }} />
              </div>
            ))}

            {/* Caption bubbles */}
            {captionBubbles.map((bubble) => (
              <div
                key={bubble.id}
                className="absolute pointer-events-none z-10 animate-fade-in"
                style={{
                  left: Math.min(bubble.x + 22, canvasW - 280),
                  top: Math.max(bubble.y - 30, 0),
                }}
              >
                <div
                  className="relative bg-[#5B3DF5] text-white text-sm px-4 py-2.5 rounded-2xl max-w-xs shadow-lg"
                  style={{ borderRadius: 14 }}
                >
                  {bubble.text}
                  <div
                    className="absolute left-0 top-3 -translate-x-2 w-0 h-0"
                    style={{
                      borderTop: "6px solid transparent",
                      borderBottom: "6px solid transparent",
                      borderRight: "8px solid #5B3DF5",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Toasts */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 space-y-2 pointer-events-none z-20">
            {toasts.map((t) => (
              <div
                key={t.id}
                className="bg-slate-800 text-white text-sm px-4 py-2 rounded-full shadow-lg animate-fade-in"
              >
                {t.text}
              </div>
            ))}
          </div>
        </div>

        {/* Right filmstrip */}
        <div className="w-56 bg-[#1E293B] border-l border-slate-700 flex flex-col flex-shrink-0">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
            <span className="text-xs font-semibold text-slate-400">Captured ({stepCount})</span>
            <button
              onClick={() => controlAction("undo_last")}
              className="text-xs text-[#5B3DF5] hover:underline"
            >
              Undo last
            </button>
          </div>
          <div ref={filmstripRef} className="flex-1 overflow-y-auto p-2 space-y-2">
            {steps.map((step, i) => (
              <div key={step.id} className="bg-slate-800 rounded-lg overflow-hidden animate-fade-in">
                <div className="relative">
                  <img
                    src={step.thumbUrl}
                    alt=""
                    className="w-full object-cover bg-slate-700"
                    style={{ height: 70, objectPosition: "top" }}
                  />
                  <span className="absolute bottom-1 left-1 bg-[#5B3DF5] text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                    {i + 1}
                  </span>
                </div>
                <div className="px-2 py-1.5">
                  <p className="text-xs text-slate-300 font-medium truncate">{step.title}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{step.caption}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CapturePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0F172A] flex items-center justify-center text-slate-400">
          Loading…
        </div>
      }
    >
      <CapturePageInner />
    </Suspense>
  );
}
