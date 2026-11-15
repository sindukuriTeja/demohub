"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export const dynamic = "force-dynamic";

export default function DemoSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [demo, setDemo] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/demos/${id}`)
      .then((r) => r.json())
      .then(setDemo);
  }, [id]);

  async function update(field: string, value: any) {
    setDemo((d: any) => ({ ...d, [field]: value }));
    await fetch(`/api/demos/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
  }

  const shareUrl = `${window.location.origin}/s/${demo?.shareToken}`;

  async function copyShare() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleDelete() {
    if (!confirm("Delete this demo permanently?")) return;
    await fetch(`/api/demos/${id}`, { method: "DELETE" });
    router.push("/dashboard");
  }

  if (!demo) return <div className="p-8">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <button className="text-slate-500" onClick={() => router.push(`/demo/${id}`)}>← Back</button>
          <h1 className="text-xl font-bold">Settings</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Basic Info</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Title</label>
              <input className="input" value={demo.title} onChange={(e) => update("title", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea className="input" value={demo.description || ""} onChange={(e) => update("description", e.target.value)} rows={3} />
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Sharing</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Published</p>
                <p className="text-sm text-slate-500">Make this demo viewable via share link</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={demo.isPublished} onChange={(e) => update("isPublished", e.target.checked)} />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
              </label>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Require email to view</p>
                <p className="text-sm text-slate-500">Gate the demo behind an email capture form</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={demo.requireEmail} onChange={(e) => update("requireEmail", e.target.checked)} />
                <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Password (optional)</label>
              <div className="flex gap-2">
                <input className="input flex-1" type="password" placeholder="Leave blank for no password" value={demo.password || ""} onChange={(e) => update("password", e.target.value || null)} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Share Link</label>
              <div className="flex gap-2">
                <input className="input flex-1" value={shareUrl} readOnly />
                <button className="btn-secondary" onClick={copyShare}>{copied ? "Copied!" : "Copy"}</button>
              </div>
            </div>
          </div>
        </div>

        <div className="card border-red-200">
          <h2 className="text-lg font-semibold mb-4 text-red-600">Danger Zone</h2>
          <button className="btn-danger" onClick={handleDelete}>Delete Demo</button>
        </div>
      </main>
    </div>
  );
}
