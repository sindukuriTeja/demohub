"use client";
import { useState, useRef, useEffect } from "react";

interface Annotation { id: string; x: number; y: number; text: string; }
interface SavedStep {
  order: number; title: string; description: string;
  screenshotDataUrl: string; annotations: Annotation[]; hotspots: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fillRR(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath(); ctx.fill();
}

function drawStepFrame(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  step: SavedStep, img: HTMLImageElement,
  stepIdx: number, totalSteps: number, progress: number
) {
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, W, H);

  if (img.naturalWidth > 0) {
    const scale = Math.min(W / img.naturalWidth, (H - 100) / img.naturalHeight);
    const sw = img.naturalWidth * scale, sh = img.naturalHeight * scale;
    const sx = (W - sw) / 2, sy = Math.max(10, (H - 100 - sh) / 2);
    ctx.drawImage(img, sx, sy, sw, sh);

    step.annotations.forEach((ann, idx) => {
      const ax = sx + (ann.x / 100) * sw;
      const ay = sy + (ann.y / 100) * sh;
      ctx.beginPath(); ctx.arc(ax, ay, 22, 0, Math.PI*2);
      ctx.fillStyle = "rgba(99,102,241,0.3)"; ctx.fill();
      ctx.beginPath(); ctx.arc(ax, ay, 15, 0, Math.PI*2);
      ctx.fillStyle = "#6366f1"; ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.font = "bold 13px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(idx+1), ax, ay);
      if (ann.text) {
        const lx = ax + 24, ly = ay - 18;
        ctx.font = "13px Arial";
        const tw = ctx.measureText(ann.text).width;
        ctx.fillStyle = "rgba(15,23,42,0.9)";
        fillRR(ctx, lx, ly-11, tw+20, 24, 6);
        ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
        ctx.fillText(ann.text, lx+10, ly+1);
      }
    });
  }

  // Caption bar
  ctx.fillStyle = "rgba(15,23,42,0.95)"; ctx.fillRect(0, H-100, W, 100);
  ctx.fillStyle = "#6366f1"; ctx.fillRect(0, H-100, W, 3);
  ctx.fillStyle = "#6366f1"; fillRR(ctx, 20, H-78, 80, 30, 15);
  ctx.fillStyle = "#fff"; ctx.font = "bold 12px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(`${stepIdx+1} / ${totalSteps}`, 60, H-63);
  ctx.fillStyle = "#fff"; ctx.font = "bold 20px Arial"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText(step.title, 118, H-70);
  if (step.description) {
    ctx.fillStyle = "#94a3b8"; ctx.font = "14px Arial";
    ctx.fillText(step.description, 118, H-42);
  }
  // Progress bar
  ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fillRect(0, H-4, W, 4);
  ctx.fillStyle = "#818cf8"; ctx.fillRect(0, H-4, W * progress, 4);
}

// ─── Video generator ──────────────────────────────────────────────────────────
async function buildVideo(
  steps: SavedStep[], secPerStep: number,
  canvasEl: HTMLCanvasElement,          // visible on-screen canvas
  onStatus: (s: string) => void,
  onProgress: (n: number) => void
): Promise<Blob> {
  const W = canvasEl.width, H = canvasEl.height;
  const ctx = canvasEl.getContext("2d")!;
  const FPS = 5;
  const msPerFrame = 1000 / FPS;
  const framesPerStep = Math.max(1, Math.round(secPerStep * FPS));
  const totalFrames = steps.length * framesPerStep;

  onStatus("Loading images…"); onProgress(2);
  const images: HTMLImageElement[] = [];
  for (let i = 0; i < steps.length; i++) {
    const img = await new Promise<HTMLImageElement>((res) => {
      const el = new Image(); el.onload = () => res(el); el.onerror = () => res(el);
      el.src = steps[i].screenshotDataUrl;
    });
    images.push(img);
  }

  onStatus("Starting encoder…"); onProgress(10);

  const mimeType =
    MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" :
    MediaRecorder.isTypeSupported("video/webm;codecs=vp8") ? "video/webm;codecs=vp8" :
    "video/webm";

  // Use captureStream(0) = manual frame control
  const stream = canvasEl.captureStream(0);
  const videoTrack = stream.getVideoTracks()[0] as any;

  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  const done = new Promise<void>((res) => { recorder.onstop = () => res(); });
  recorder.start(100);

  let frameIdx = 0;
  for (let si = 0; si < steps.length; si++) {
    onStatus(`Encoding step ${si+1} of ${steps.length}…`);
    const img = images[si];
    for (let f = 0; f < framesPerStep; f++) {
      const progress = frameIdx / Math.max(totalFrames - 1, 1);
      drawStepFrame(ctx, W, H, steps[si], img, si, steps.length, progress);
      // Force the stream to capture this exact canvas frame
      if (typeof videoTrack.requestFrame === "function") {
        videoTrack.requestFrame();
      }
      // Wait real time so video has correct playback speed
      await new Promise<void>((r) => setTimeout(r, msPerFrame));
      frameIdx++;
      onProgress(10 + Math.round((frameIdx / totalFrames) * 88));
    }
  }

  recorder.stop();
  await done;
  onProgress(100);
  onStatus("Done!");
  return new Blob(chunks, { type: mimeType });
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function CapturePage() {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<"setup"|"browse"|"annotate"|"generating"|"export"|"save">("setup");
  const [screenshotDataUrl, setScreenshotDataUrl] = useState("");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activeId, setActiveId] = useState<string|null>(null);
  const [stepTitle, setStepTitle] = useState("");
  const [stepDescription, setStepDescription] = useState("");
  const [steps, setSteps] = useState<SavedStep[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState("");
  const [secPerStep, setSecPerStep] = useState(3);
  const [genProgress, setGenProgress] = useState(0);
  const [genStatus, setGenStatus] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoBlob, setVideoBlob] = useState<Blob|null>(null);

  // Save-to-demo form
  const [demoTitle, setDemoTitle] = useState("");
  const [demoDescription, setDemoDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const annotateAreaRef = useRef<HTMLDivElement>(null);
  // Visible canvas used for video generation (must be in DOM + visible for captureStream to work)
  const videoCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!activeId) return;
    setTimeout(() => {
      const el = document.getElementById(`ann-${activeId}`);
      if (el) (el as HTMLInputElement).focus();
    }, 50);
  }, [activeId]);

  // ── Screenshot via getDisplayMedia ──────────────────────────────────────────
  async function takeScreenshot() {
    setCapturing(true); setCaptureError("");
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { width:{ideal:1920}, height:{ideal:1080}, frameRate:{ideal:1} },
        audio: false, preferCurrentTab: true,
      });
      const video = document.createElement("video");
      video.srcObject = stream; video.muted = true;
      await new Promise<void>((res) => {
        video.onloadedmetadata = () => {
          video.play();
          video.requestVideoFrameCallback ? video.requestVideoFrameCallback(() => res()) : setTimeout(res, 400);
        };
      });
      const c = document.createElement("canvas");
      c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext("2d")!.drawImage(video, 0, 0);
      stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      video.srcObject = null;
      goAnnotate(c.toDataURL("image/png"));
    } catch (err: any) {
      setCapturing(false);
      if (err?.name === "NotAllowedError" || err?.name === "AbortError") {
        goAnnotate(makePlaceholder(url, steps.length+1));
      } else {
        setCaptureError("Capture failed: " + (err?.message ?? String(err)));
      }
    }
  }

  function goAnnotate(dataUrl: string) {
    setScreenshotDataUrl(dataUrl);
    setAnnotations([]); setActiveId(null);
    setStepTitle(`Step ${steps.length+1}`);
    setStepDescription("");
    setCapturing(false);
    setPhase("annotate");
  }

  function makePlaceholder(pageUrl: string, stepNum: number) {
    const c = document.createElement("canvas"); c.width = 1280; c.height = 720;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#1e293b"; ctx.fillRect(0,0,1280,720);
    ctx.fillStyle = "#334155"; ctx.fillRect(0,0,1280,44);
    ctx.fillStyle = "#94a3b8"; ctx.font = "13px monospace"; ctx.fillText(pageUrl || "No URL", 86, 27);
    ctx.textAlign = "center";
    ctx.fillStyle = "#6366f1"; ctx.font = "bold 20px Arial"; ctx.fillText(`STEP ${stepNum}`, 640, 330);
    ctx.fillStyle = "#e2e8f0"; ctx.font = "16px Arial"; ctx.fillText("Click to annotate", 640, 370);
    return c.toDataURL("image/png");
  }

  // ── Annotation ──────────────────────────────────────────────────────────────
  function handleAnnotateClick(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("[data-dot]")) return;
    const rect = annotateAreaRef.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const id = Math.random().toString(36).slice(2);
    setAnnotations(p => [...p, {id, x, y, text:""}]);
    setActiveId(id);
  }

  function confirmStep() {
    if (!stepTitle.trim()) { alert("Enter a step title"); return; }
    const step: SavedStep = {
      order: steps.length, title: stepTitle.trim(), description: stepDescription.trim(),
      screenshotDataUrl, annotations,
      hotspots: JSON.stringify(annotations.map(a => ({id:a.id,x:a.x,y:a.y,width:5,height:5,label:a.text||`Click ${steps.length+1}`}))),
    };
    const newSteps = [...steps, step];
    setSteps(newSteps);

    // Send to parent (create page)
    const target = window.opener ?? window.parent;
    target?.postMessage({ type:"DEMO_STEP", demo:"1", step: {
      order:step.order, title:step.title, description:step.description,
      snapshot: buildSnapshotHtml(step), hotspots:step.hotspots,
    }}, "*");
    setPhase("browse");
  }

  function buildSnapshotHtml(step: SavedStep) {
    const dots = step.annotations.map((a,i) => `
      <div style="position:absolute;left:${a.x}%;top:${a.y}%;transform:translate(-50%,-50%);
        width:30px;height:30px;border-radius:50%;background:#6366f1;border:3px solid white;
        box-shadow:0 0 0 2px #6366f1,0 4px 12px rgba(0,0,0,.5);display:flex;align-items:center;
        justify-content:center;color:white;font-weight:bold;font-size:13px;z-index:20;">${i+1}</div>
      ${a.text ? `<div style="position:absolute;left:calc(${a.x}% + 20px);top:calc(${a.y}% - 15px);
        background:#1e293b;color:white;font-size:12px;padding:4px 10px;border-radius:5px;
        white-space:nowrap;z-index:20;border:1px solid #475569;">${a.text}</div>` : ""}
    `).join("");
    return `<div style="position:relative;"><img src="${step.screenshotDataUrl}" style="width:100%;display:block;"/>${dots}</div>`;
  }

  // ── Video generation ─────────────────────────────────────────────────────────
  async function generateVideo() {
    if (steps.length === 0) return;
    if (!videoCanvasRef.current) { alert("Canvas not ready"); return; }

    setPhase("generating");
    setGenProgress(0);
    setGenStatus("Starting…");
    setVideoUrl(""); setVideoBlob(null);

    try {
      const blob = await buildVideo(
        steps, secPerStep, videoCanvasRef.current,
        (s) => setGenStatus(s),
        (n) => setGenProgress(n)
      );
      const blobUrl = URL.createObjectURL(blob);
      setVideoUrl(blobUrl);
      setVideoBlob(blob);
      setPhase("export");
    } catch (e: any) {
      console.error(e);
      alert("Video generation failed: " + e.message);
      setPhase("browse");
    }
  }

  function downloadVideo() {
    if (!videoBlob) return;
    const a = document.createElement("a");
    a.href = videoUrl; a.download = "demo.webm"; a.click();
  }

  // ── Save to demo (API call from popup) ──────────────────────────────────────
  async function saveToDemo() {
    if (!demoTitle.trim()) { setSaveError("Please enter a title"); return; }
    setSaving(true); setSaveError("");
    try {
      // Convert video blob to base64 data URL so it persists in the DB
      let videoDataUrl = "";
      if (videoBlob) {
        videoDataUrl = await new Promise<string>((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result as string);
          reader.onerror = rej;
          reader.readAsDataURL(videoBlob);
        });
      }

      // Create the demo
      const demoRes = await fetch("/api/demos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: demoTitle.trim(), description: demoDescription.trim(), type: "interactive" }),
        credentials: "include",
      });
      const demo = await demoRes.json();
      if (!demoRes.ok) { setSaveError(demo.error || "Failed to create demo"); setSaving(false); return; }

      // Save steps — first step gets the video URL so the viewer can play it
      const payload = steps.map((s, i) => ({
        order: i,
        title: s.title,
        description: s.description,
        snapshot: buildSnapshotHtml(s),
        hotspots: s.hotspots,
        // Store video on the first step so the demo viewer picks it up
        videoUrl: i === 0 && videoDataUrl ? videoDataUrl : undefined,
      }));

      const stepsRes = await fetch(`/api/demos/${demo.id}/steps`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps: payload }),
        credentials: "include",
      });
      if (!stepsRes.ok) { setSaveError("Failed to save steps"); setSaving(false); return; }

      // Tell parent window to navigate + close popup
      const target = window.opener ?? window.parent;
      target?.postMessage({ type: "DEMO_SAVED", demo: "1", demoId: demo.id }, "*");
      if (window.opener) {
        window.opener.location.href = `/demo/${demo.id}`;
      }
      window.close();
    } catch (e: any) {
      setSaveError("Network error: " + e.message);
      setSaving(false);
    }
  }

  const totalDuration = steps.length * secPerStep;

  return (
    <div className="h-screen flex flex-col bg-slate-900 text-white overflow-hidden" style={{userSelect:"none"}}>

      {/* Hidden canvas used for video generation — must be in DOM */}
      <canvas
        ref={videoCanvasRef}
        width={1280} height={720}
        style={{
          position: "fixed", bottom: 0, right: 0,
          width: phase === "generating" ? 320 : 0,
          height: phase === "generating" ? 180 : 0,
          border: phase === "generating" ? "2px solid #6366f1" : "none",
          zIndex: 50, background: "#000",
          borderRadius: 8,
        }}
      />

      {/* Top bar */}
      <div className="flex-shrink-0 h-11 bg-slate-800 border-b border-slate-700 flex items-center px-4 gap-3">
        <span className="font-semibold text-sm">🎬 DemoHub</span>
        {phase === "setup" && <span className="text-xs text-slate-400 flex-1">Set URL and duration</span>}
        {phase === "browse" && (
          <>
            <span className="text-xs text-slate-400 flex-1 truncate">Navigate your site, then click <strong className="text-indigo-400">📷 Capture Step</strong></span>
            {steps.length > 0 && (
              <button onClick={generateVideo} className="bg-green-600 hover:bg-green-500 px-4 py-1 rounded text-sm font-bold whitespace-nowrap">
                Done → Make Video 🎬
              </button>
            )}
          </>
        )}
        {phase === "annotate" && <span className="text-xs text-slate-300 flex-1"><span className="text-indigo-400 font-semibold">Click the screenshot</span> to drop a pin →</span>}
        {phase === "generating" && <span className="text-xs text-green-300 flex-1 font-medium">⏳ Generating video… {genProgress}% — {genStatus}</span>}
        {phase === "export" && <span className="text-xs text-green-300 flex-1 font-medium">✅ Video ready!</span>}
        {phase === "save" && <span className="text-xs text-slate-300 flex-1">Save your demo to the dashboard</span>}
      </div>

      {/* ── Setup ── */}
      {phase === "setup" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
          <div className="text-5xl">🎬</div>
          <div className="text-center max-w-lg">
            <p className="text-xl font-bold text-white">DemoHub Screen Capture</p>
            <p className="text-sm text-slate-400 mt-1">Enter your website URL, choose step duration, then start recording.</p>
          </div>
          <div className="w-full max-w-lg bg-slate-800 rounded-2xl border border-slate-700 p-6 space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Website URL</label>
              <input autoFocus
                className="w-full rounded-lg px-4 py-2.5 bg-slate-700 border border-slate-600 text-white text-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                value={url} onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && setPhase("browse")}
                placeholder="https://your-app.com" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">⏱ Duration per step in video</label>
              <div className="flex items-center gap-4">
                <input type="range" min={1} max={15} step={1} value={secPerStep}
                  onChange={(e) => setSecPerStep(Number(e.target.value))}
                  className="flex-1 h-2 rounded-full appearance-none bg-slate-600 accent-indigo-500 cursor-pointer" />
                <div className="bg-indigo-600 rounded-xl px-4 py-2 text-center min-w-[72px] flex-shrink-0">
                  <div className="text-2xl font-bold leading-none">{secPerStep}</div>
                  <div className="text-xs text-indigo-200">sec / step</div>
                </div>
              </div>
              <div className="flex gap-2 mt-3 flex-wrap">
                {[1,2,3,5,8,10,15].map(n => (
                  <button key={n} onClick={() => setSecPerStep(n)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${secPerStep===n ? "bg-indigo-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}>
                    {n}s
                  </button>
                ))}
              </div>
            </div>
            <button onClick={() => setPhase("browse")}
              className="w-full bg-indigo-600 hover:bg-indigo-500 py-3 rounded-xl text-sm font-bold">
              Start Recording →
            </button>
          </div>
        </div>
      )}

      {/* ── Browse ── */}
      {phase === "browse" && (
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-shrink-0 bg-slate-800 border-b border-slate-700 px-4 py-2 flex items-center gap-3">
              <span className="text-xs text-slate-400 flex-1 truncate">
                {url ? <>Viewing: <span className="text-slate-200">{url}</span></> : "No URL loaded"}
              </span>
              {captureError && <span className="text-xs text-red-400 max-w-xs truncate">⚠ {captureError}</span>}
              <span className="text-xs text-slate-500">{steps.length} step{steps.length!==1?"s":""}</span>
              <button onClick={takeScreenshot} disabled={capturing}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-5 py-1.5 rounded-lg text-sm font-bold whitespace-nowrap flex items-center gap-2">
                {capturing ? <><span className="animate-spin">⏳</span> Capturing…</> : <>📷 Capture Step</>}
              </button>
            </div>
            <div className="flex-1 relative bg-white">
              {url ? (
                <iframe ref={iframeRef} src={url} className="w-full h-full border-0"
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-top-navigation"
                  title="website preview" />
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-4 bg-slate-50 text-slate-400">
                  <div className="text-5xl">📋</div>
                  <p className="text-sm text-center max-w-xs">No URL — click <strong className="text-indigo-600">📷 Capture Step</strong> to screenshot any tab.</p>
                </div>
              )}
            </div>
          </div>

          {steps.length > 0 && (
            <div className="w-56 bg-slate-800 border-l border-slate-700 overflow-y-auto p-3 flex-shrink-0">
              <p className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Captured ({steps.length})</p>
              {steps.map((s,i) => (
                <div key={i} className="mb-2 bg-slate-700 rounded-lg overflow-hidden">
                  <img src={s.screenshotDataUrl} alt="" className="w-full object-cover object-top" style={{height:60}} />
                  <div className="px-2 py-1.5 flex items-center gap-1.5">
                    <span className="bg-indigo-600 rounded-full text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center flex-shrink-0">{i+1}</span>
                    <span className="text-xs text-white truncate">{s.title}</span>
                  </div>
                </div>
              ))}
              <button onClick={generateVideo}
                className="mt-2 w-full bg-green-600 hover:bg-green-500 py-2.5 rounded-lg text-xs font-bold">
                Done → Make Video 🎬
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Annotate ── */}
      {phase === "annotate" && (
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-auto bg-slate-950 flex items-start justify-center p-4">
            <div ref={annotateAreaRef} className="relative inline-block" style={{cursor:"crosshair"}} onClick={handleAnnotateClick}>
              <img src={screenshotDataUrl} alt="screenshot" draggable={false}
                className="block rounded-lg shadow-2xl"
                style={{maxWidth:"100%", maxHeight:"calc(100vh - 110px)"}} />
              {annotations.map((ann,idx) => (
                <div key={ann.id} data-dot="1">
                  <div data-dot="1" onClick={(e) => {e.stopPropagation(); setActiveId(ann.id);}}
                    style={{position:"absolute",left:`${ann.x}%`,top:`${ann.y}%`,transform:"translate(-50%,-50%)",
                      width:32,height:32,borderRadius:"50%",
                      background:activeId===ann.id?"#818cf8":"#6366f1",
                      border:"3px solid white",boxShadow:"0 0 0 2px #6366f1,0 4px 14px rgba(0,0,0,.7)",
                      display:"flex",alignItems:"center",justifyContent:"center",
                      color:"white",fontWeight:"bold",fontSize:13,zIndex:30,cursor:"pointer"}}>
                    {idx+1}
                  </div>
                  {ann.text && (
                    <div data-dot="1" style={{position:"absolute",left:`calc(${ann.x}% + 20px)`,top:`calc(${ann.y}% - 16px)`,
                      background:"#1e293b",color:"white",fontSize:12,padding:"4px 10px",borderRadius:5,
                      whiteSpace:"nowrap",zIndex:30,border:"1px solid #475569",pointerEvents:"none"}}>
                      {ann.text}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="w-80 bg-slate-800 border-l border-slate-700 flex flex-col flex-shrink-0 overflow-hidden">
            <div className="p-4 border-b border-slate-700">
              <p className="text-sm font-semibold mb-0.5">Annotate this step</p>
              <p className="text-xs text-slate-400">Click screenshot to place pins. Add a label.</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {annotations.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-600 p-4 text-center mt-2">
                  <div className="text-2xl mb-1">👆</div>
                  <p className="text-xs text-slate-400">Click screenshot to drop a pin</p>
                </div>
              ) : annotations.map((ann,idx) => (
                <div key={ann.id}
                  className={`rounded-lg border p-3 cursor-pointer ${activeId===ann.id?"border-indigo-500 bg-indigo-950/40":"border-slate-600 bg-slate-700 hover:border-slate-500"}`}
                  onClick={() => setActiveId(ann.id)}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{idx+1}</div>
                    <span className="text-xs text-slate-300 font-medium">Pin {idx+1}</span>
                    <button className="ml-auto text-red-400 text-xs"
                      onClick={(e) => {e.stopPropagation(); setAnnotations(p=>p.filter(a=>a.id!==ann.id)); if(activeId===ann.id) setActiveId(null);}}>✕</button>
                  </div>
                  <input id={`ann-${ann.id}`}
                    className="w-full rounded px-2.5 py-1.5 text-sm bg-slate-600 border border-slate-500 text-white placeholder-slate-400 focus:outline-none focus:border-indigo-400"
                    placeholder="Label (e.g. Click here)"
                    value={ann.text}
                    onChange={(e) => setAnnotations(p=>p.map(a=>a.id===ann.id?{...a,text:e.target.value}:a))}
                    onClick={(e) => e.stopPropagation()} />
                </div>
              ))}
              <div className="border-t border-slate-600 pt-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Step Title <span className="text-red-400">*</span></label>
                  <input className="w-full rounded px-3 py-2 text-sm bg-slate-700 border border-slate-600 text-white placeholder-slate-400 focus:outline-none focus:border-indigo-400"
                    value={stepTitle} onChange={(e) => setStepTitle(e.target.value)} placeholder="e.g. Search for jobs" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Description</label>
                  <textarea className="w-full rounded px-3 py-2 text-sm bg-slate-700 border border-slate-600 text-white placeholder-slate-400 focus:outline-none focus:border-indigo-400 resize-none"
                    value={stepDescription} onChange={(e) => setStepDescription(e.target.value)} placeholder="What does the user do here?" rows={2} />
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-700 space-y-2 flex-shrink-0">
              <button onClick={confirmStep} className="w-full bg-indigo-600 hover:bg-indigo-500 py-2.5 rounded text-sm font-semibold">
                ✓ Save Step & Continue
              </button>
              <button onClick={() => setPhase("browse")} className="w-full bg-slate-700 hover:bg-slate-600 py-2 rounded text-sm text-slate-300">
                ← Discard & Go Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Generating ── */}
      {phase === "generating" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
          <div className="text-5xl animate-pulse">🎬</div>
          <div className="text-center">
            <p className="text-xl font-bold text-white mb-1">Creating your video…</p>
            <p className="text-sm text-slate-400">{genStatus}</p>
            <p className="text-xs text-slate-500 mt-1">Keep this window open and in focus</p>
          </div>
          <div className="w-full max-w-md">
            <div className="bg-slate-700 rounded-full h-4 overflow-hidden">
              <div className="bg-indigo-500 h-full transition-all duration-200 rounded-full"
                style={{width:`${genProgress}%`}} />
            </div>
            <p className="text-center text-sm text-slate-400 mt-2">{genProgress}%</p>
          </div>
          {/* Show live canvas preview */}
          <p className="text-xs text-slate-500">Preview rendering below ↓</p>
        </div>
      )}

      {/* ── Export ── */}
      {phase === "export" && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
            <div className="text-center">
              <div className="text-4xl mb-2">✅</div>
              <h2 className="text-xl font-bold text-green-400">Video Ready!</h2>
              <p className="text-slate-400 text-sm mt-1">{steps.length} steps · {totalDuration}s total</p>
            </div>

            {videoUrl && (
              <div className="bg-slate-800 rounded-xl border border-green-700 overflow-hidden">
                <video src={videoUrl} controls autoPlay loop
                  className="w-full bg-black" style={{maxHeight:360}} />
                <div className="p-4 flex gap-3">
                  <button onClick={downloadVideo}
                    className="flex-1 bg-slate-700 hover:bg-slate-600 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2">
                    ⬇ Download WebM
                  </button>
                  <button onClick={() => setPhase("save")}
                    className="flex-1 bg-green-600 hover:bg-green-500 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2">
                    💾 Save to Demo Dashboard →
                  </button>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setPhase("browse")}
                className="flex-1 bg-slate-700 hover:bg-slate-600 py-2.5 rounded-xl text-sm text-slate-300">
                ← Add More Steps
              </button>
              <button onClick={() => {setPhase("generating"); generateVideo();}}
                className="flex-1 bg-slate-700 hover:bg-slate-600 py-2.5 rounded-xl text-sm text-slate-300">
                🔄 Re-generate Video
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Save to Demo ── */}
      {phase === "save" && (
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="w-full max-w-lg bg-slate-800 rounded-2xl border border-slate-700 p-8 space-y-5">
            <div className="text-center mb-2">
              <div className="text-4xl mb-2">💾</div>
              <h2 className="text-xl font-bold text-white">Save Demo to Dashboard</h2>
              <p className="text-sm text-slate-400 mt-1">Give your demo a title and save it. It will appear in your dashboard.</p>
            </div>

            {saveError && (
              <div className="p-3 bg-red-900/40 border border-red-700 rounded-lg text-red-300 text-sm">⚠ {saveError}</div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Demo Title <span className="text-red-400">*</span></label>
              <input autoFocus
                className="w-full rounded-lg px-4 py-2.5 bg-slate-700 border border-slate-600 text-white text-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                value={demoTitle} onChange={(e) => setDemoTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveToDemo()}
                placeholder="e.g. How to search for jobs on NexJobs" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Description <span className="text-slate-500 font-normal">(optional)</span></label>
              <textarea
                className="w-full rounded-lg px-4 py-2.5 bg-slate-700 border border-slate-600 text-white text-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 resize-none"
                value={demoDescription} onChange={(e) => setDemoDescription(e.target.value)}
                placeholder="What does this demo show?" rows={2} />
            </div>

            <div className="bg-slate-700/50 rounded-lg p-3 text-xs text-slate-400 space-y-1">
              <p><span className="text-slate-300 font-medium">Steps:</span> {steps.length}</p>
              <p><span className="text-slate-300 font-medium">Video:</span> {totalDuration}s · WebM</p>
              <p><span className="text-slate-300 font-medium">Screenshots:</span> {steps.length} captured</p>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setPhase("export")}
                className="flex-1 bg-slate-700 hover:bg-slate-600 py-3 rounded-xl text-sm text-slate-300">
                ← Back
              </button>
              <button onClick={saveToDemo} disabled={saving}
                className="flex-2 flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-60 py-3 rounded-xl text-sm font-bold">
                {saving ? "Saving…" : "✓ Save to Dashboard"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
