import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DemoEditorPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const demo = await prisma.demo.findFirst({
    where: { id: params.id, workspace: { ownerId: session.user.id } },
    include: { steps: { orderBy: { order: "asc" } }, workspace: true },
  });

  if (!demo) redirect("/dashboard");

  const shareUrl = `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/s/${demo.shareToken}`;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-slate-500 hover:text-slate-700">← Back</Link>
            <h1 className="text-xl font-bold">{demo.title}</h1>
            <span className={`text-xs px-2 py-1 rounded-full ${demo.isPublished ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}`}>
              {demo.isPublished ? "Published" : "Draft"}
            </span>
          </div>
          <div className="flex gap-3">
            <Link href={`/play/${demo.shareToken}`} target="_blank" className="btn-secondary">Preview</Link>
            <Link href={`/editor/${demo.id}/settings`} className="btn-secondary">Settings</Link>
            <Link href={`/editor/${demo.id}/agent`} className="btn-secondary">AI Agent</Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 grid lg:grid-cols-3 gap-8">
        {/* Steps */}
        <div className="lg:col-span-2">
          <div className="card mb-6">
            <h2 className="text-lg font-semibold mb-4">Steps ({demo.steps.length})</h2>
            {demo.steps.length === 0 ? (
              <p className="text-slate-500">No steps yet. Edit via the recorder.</p>
            ) : (
              <div className="space-y-3">
                {demo.steps.map((step, i) => (
                  <Link key={step.id} href={`/editor/${demo.id}/step/${i}`} className="block border border-slate-200 rounded-lg p-4 hover:shadow-md transition">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono bg-slate-100 px-2 py-1 rounded">Step {i + 1}</span>
                      <div className="flex-1">
                        <p className="font-medium">{step.title || "Untitled step"}</p>
                        <p className="text-sm text-slate-500 line-clamp-1">{step.description || "No description"}</p>
                      </div>
                      <span className="text-xs text-slate-400">{(() => { try { return JSON.parse(step.hotspots || "[]").length } catch { return 0 } })()} hotspots</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Analytics summary */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Analytics</h2>
            <Link href={`/editor/${demo.id}/analytics`} className="block">
              <div className="grid grid-cols-4 gap-4 text-center">
                <div className="bg-slate-50 rounded-lg p-4">
                  <p className="text-2xl font-bold text-brand-600">—</p>
                  <p className="text-xs text-slate-500">Views</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-4">
                  <p className="text-2xl font-bold text-brand-600">—</p>
                  <p className="text-xs text-slate-500">Leads</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-4">
                  <p className="text-2xl font-bold text-brand-600">{demo.steps.length}</p>
                  <p className="text-xs text-slate-500">Steps</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-4">
                  <p className="text-2xl font-bold text-brand-600">{demo.isPublished ? "Live" : "—"}</p>
                  <p className="text-xs text-slate-500">Status</p>
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-3 text-center">View detailed analytics →</p>
            </Link>
          </div>
        </div>

        {/* Share */}
        <div>
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Share</h2>
            <p className="text-sm text-slate-600 mb-2">Share this link with viewers:</p>
            <div className="flex gap-2">
              <input className="input flex-1 text-sm" value={shareUrl} readOnly />
              <button
                className="btn-secondary"
                onClick={() => navigator.clipboard.writeText(shareUrl)}
              >
                Copy
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-3">
              {demo.isPublished ? "Demo is live and viewable." : "Publish in Settings to make it viewable."}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
