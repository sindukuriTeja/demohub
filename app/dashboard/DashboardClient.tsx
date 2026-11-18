"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

function getThumb(steps: any[]): string {
  if (!steps?.length) return "";
  const s = steps[0];
  if (s.screenshotUrl) return s.screenshotUrl;
  if (s.snapshot) { const m = s.snapshot.match(/src="([^"]+)"/); if (m) return m[1]; }
  return "";
}

function statusBadge(status: string, isPublished: boolean) {
  if (status === "recording") return { label: "Recording", cls: "bg-amber-100 text-amber-700" };
  if (isPublished) return { label: "Ready", cls: "bg-green-100 text-green-700" };
  return { label: "Draft", cls: "bg-slate-100 text-slate-600" };
}

export default function DashboardClient({ demos: initialDemos }: { demos: any[] }) {
  const router = useRouter();
  const [demos, setDemos] = useState(initialDemos);
  const [search, setSearch] = useState("");
  const [shareModalId, setShareModalId] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = demos.filter(d =>
    d.title.toLowerCase().includes(search.toLowerCase())
  );

  async function deleteDemo(id: string, title: string) {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    await fetch(`/api/demos/${id}`, { method: "DELETE" });
    setDemos(d => d.filter(x => x.id !== id));
  }

  async function duplicateDemo(id: string) {
    const res = await fetch(`/api/demos/${id}`);
    const demo = await res.json();
    const newRes = await fetch("/api/demos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `${demo.title} (copy)`, description: demo.description, type: demo.type }),
    });
    const newDemo = await newRes.json();
    if (newRes.ok) router.push(`/editor/${newDemo.id}`);
  }

  function openShare(demo: any) {
    const url = `${window.location.origin}/d/${demo.shareToken}`;
    setShareUrl(url);
    setShareModalId(demo.id);
  }

  async function publishToggle(demo: any) {
    const next = !demo.isPublished;
    await fetch(`/api/demos/${demo.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublished: next }),
    });
    setDemos(ds => ds.map(d => d.id === demo.id ? { ...d, isPublished: next } : d));
  }

  return (
    <>
      {/* Search */}
      <div className="mb-6">
        <input
          className="w-full max-w-sm border border-[#E5E7EB] bg-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#5B3DF5]"
          placeholder="Search demos…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-16 text-center">
          <div className="text-5xl mb-4">🎬</div>
          <h2 className="text-xl font-bold text-[#0F172A] mb-2">No demos yet</h2>
          <p className="text-slate-500 mb-6">Create your first interactive product demo</p>
          <Link href="/create" className="px-6 py-3 bg-[#5B3DF5] text-white rounded-xl font-semibold hover:bg-[#4C2FE0]">
            Create your first demo
          </Link>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((demo) => {
            const thumb = getThumb(demo.steps);
            const badge = statusBadge(demo.status, demo.isPublished);
            return (
              <div key={demo.id} className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden hover:shadow-md transition-shadow group">
                {/* Thumbnail */}
                <div className="relative bg-slate-100" style={{ aspectRatio: "16/9" }}>
                  {thumb ? (
                    <img src={thumb} alt={demo.title} className="w-full h-full object-cover object-top" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300 text-4xl">🎬</div>
                  )}
                  <span className={`absolute top-3 left-3 text-xs font-semibold px-2 py-1 rounded-full ${badge.cls}`}>
                    {badge.label}
                  </span>
                </div>

                {/* Info */}
                <div className="p-4">
                  <h3 className="font-semibold text-[#0F172A] truncate mb-1">{demo.title}</h3>
                  <div className="flex items-center gap-3 text-xs text-slate-400 mb-4">
                    <span>{demo._count.steps} step{demo._count.steps !== 1 ? "s" : ""}</span>
                    <span>·</span>
                    <span>{new Date(demo.updatedAt).toLocaleDateString()}</span>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 flex-wrap">
                    <Link href={`/editor/${demo.id}`}
                      className="flex-1 text-center px-3 py-2 bg-[#5B3DF5] hover:bg-[#4C2FE0] text-white text-xs font-semibold rounded-lg transition-colors">
                      Open editor
                    </Link>
                    <Link href={`/preview/${demo.id}`} target="_blank"
                      className="px-3 py-2 border border-[#E5E7EB] hover:border-slate-400 text-slate-600 text-xs font-medium rounded-lg">
                      Preview
                    </Link>
                    <button onClick={() => openShare(demo)}
                      className="px-3 py-2 border border-[#E5E7EB] hover:border-slate-400 text-slate-600 text-xs font-medium rounded-lg">
                      Share
                    </button>
                    <div className="relative group/menu">
                      <button className="px-2 py-2 border border-[#E5E7EB] hover:border-slate-400 text-slate-600 text-xs rounded-lg">⋮</button>
                      <div className="absolute right-0 top-full mt-1 bg-white rounded-xl border border-[#E5E7EB] shadow-xl p-1 z-50 w-44 hidden group-hover/menu:block">
                        <button onClick={() => duplicateDemo(demo.id)}
                          className="w-full text-left text-sm px-3 py-2 hover:bg-[#F4F5FB] rounded-lg">Duplicate</button>
                        <button onClick={() => publishToggle(demo)}
                          className="w-full text-left text-sm px-3 py-2 hover:bg-[#F4F5FB] rounded-lg">
                          {demo.isPublished ? "Unpublish" : "Publish"}
                        </button>
                        <button onClick={() => deleteDemo(demo.id, demo.title)}
                          className="w-full text-left text-sm px-3 py-2 hover:bg-red-50 text-red-500 rounded-lg">Delete</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Share modal */}
      {shareModalId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => setShareModalId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Share demo</h2>
              <button onClick={() => setShareModalId(null)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <div className="flex gap-2 mb-4">
              <input readOnly value={shareUrl}
                className="flex-1 text-sm border border-[#E5E7EB] rounded-lg px-3 py-2 bg-slate-50 text-slate-600" />
              <button
                onClick={() => { navigator.clipboard.writeText(shareUrl); setCopiedId(shareModalId); setTimeout(() => setCopiedId(null), 1500); }}
                className="bg-[#5B3DF5] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#4C2FE0]">
                {copiedId === shareModalId ? "Copied!" : "Copy link"}
              </button>
            </div>
            <Link href={shareUrl} target="_blank"
              className="block w-full text-center border border-[#E5E7EB] rounded-lg py-2 text-sm text-slate-600 hover:border-slate-400">
              Open share link →
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
