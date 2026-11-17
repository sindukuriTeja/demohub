"use client";
// Capture page — opens in a popup, captures clicks on the user's app
import { useEffect, useState, useRef } from "react";

interface Hotspot {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

export default function CapturePage() {
  const [url, setUrl] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [stepNum, setStepNum] = useState(0);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [capturedHtml, setCapturedHtml] = useState("");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  function startCapture() {
    if (!url) return;
    setCapturing(true);
    setStepNum(0);
    setHotspots([]);
  }

  // When user clicks in the iframe container, capture a hotspot
  function handleCaptureClick(e: React.MouseEvent) {
    if (!capturing) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    const hotspot: Hotspot = {
      id: Math.random().toString(36).slice(2),
      x,
      y,
      width: 8,
      height: 8,
      label: `Click ${stepNum + 1}`,
    };

    setHotspots((prev) => [...prev, hotspot]);

    // Capture the iframe's DOM as HTML for the snapshot
    let html: string;
    try {
      const iframeDoc = iframeRef.current?.contentDocument;
      html = iframeDoc ? iframeDoc.documentElement.outerHTML : "<p>Could not capture</p>";
      setCapturedHtml(html);
    } catch (err) {
      // Cross-origin — can't read DOM, use placeholder
      html = "<p>Cross-origin content (snapshot limited)</p>";
      setCapturedHtml(html);
    }

    // Send step to parent window
    const step = {
      order: stepNum,
      title: `Step ${stepNum + 1}`,
      description: "",
      snapshot: html,
      hotspots: JSON.stringify([...hotspots, hotspot]),
    };
    window.parent.postMessage({ type: "DEMO_STEP", demo: "1", step }, "*");

    setStepNum((n) => n + 1);
  }

  function finish() {
    window.parent.postMessage({ type: "DEMO_DONE", demo: "1" }, "*");
    window.close();
  }

  return (
    <div className="h-screen flex flex-col bg-slate-900 text-white">
      <div className="p-4 border-b border-slate-700 flex items-center gap-4">
        <span className="font-semibold">DemoHub Capture</span>
        <input
          className="flex-1 rounded px-3 py-2 text-slate-900 text-sm"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://app.yourproduct.com"
          disabled={capturing}
        />
        {!capturing ? (
          <button className="bg-brand-600 px-4 py-2 rounded text-sm" onClick={startCapture}>
            Start
          </button>
        ) : (
          <div className="flex gap-2">
            <span className="text-sm self-center">Steps: {stepNum}</span>
            <button className="bg-red-600 px-4 py-2 rounded text-sm" onClick={finish}>
              Done ({stepNum} steps)
            </button>
          </div>
        )}
      </div>
      <div
        className={`flex-1 relative ${capturing ? "cursor-crosshair" : ""}`}
        onClick={capturing ? handleCaptureClick : undefined}
      >
        {url && (
          <iframe
            ref={iframeRef}
            src={url}
            className="w-full h-full border-0"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            title="capture"
          />
        )}
        {!url && (
          <div className="flex items-center justify-center h-full text-slate-400">
            Enter a URL and click Start
          </div>
        )}
        {capturing && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-brand-600 px-4 py-2 rounded-full text-sm">
            Click on elements to add steps ({stepNum} captured)
          </div>
        )}
      </div>
    </div>
  );
}
