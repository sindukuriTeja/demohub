import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const demos = await prisma.demo.findMany({
    where: { workspace: { ownerId: session.user.id } },
    include: {
      _count: { select: { steps: true, views: true, leads: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-brand-600 flex items-center justify-center text-white font-bold">D</div>
            <span className="text-xl font-bold">DemoHub</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600">{session.user.email}</span>
            <Link href="/api/auth/signout" className="btn-secondary text-sm">Log out</Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Your Demos</h1>
            <p className="text-slate-600">Create and manage your interactive product demos</p>
          </div>
          <Link href="/create" className="btn-primary">+ New Demo</Link>
        </div>

        {demos.length === 0 ? (
          <div className="card text-center py-16">
            <p className="text-slate-600 mb-4">No demos yet. Create your first one!</p>
            <Link href="/create" className="btn-primary">Create a demo</Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {demos.map((demo) => (
              <Link key={demo.id} href={`/demo/${demo.id}`} className="card hover:shadow-md transition block">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-lg truncate">{demo.title}</h3>
                  <span className={`text-xs px-2 py-1 rounded-full ${demo.isPublished ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}`}>
                    {demo.isPublished ? "Published" : "Draft"}
                  </span>
                </div>
                <p className="text-sm text-slate-500 mb-4 line-clamp-2">{demo.description || "No description"}</p>
                <div className="flex gap-4 text-xs text-slate-500">
                  <span>🎬 {demo._count.steps} steps</span>
                  <span>👁 {demo._count.views} views</span>
                  <span>📧 {demo._count.leads} leads</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
