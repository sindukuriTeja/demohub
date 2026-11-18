import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const demos = await prisma.demo.findMany({
    where: { workspace: { ownerId: session.user.id } },
    include: {
      _count: { select: { steps: true, views: true } },
      steps: { orderBy: { order: "asc" }, take: 1, select: { screenshotUrl: true, snapshot: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="min-h-screen bg-[#F4F5FB]" style={{ fontFamily: "Inter, sans-serif" }}>
      {/* Header */}
      <header className="bg-white border-b border-[#E5E7EB]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-[#5B3DF5] flex items-center justify-center text-white font-bold text-sm">D</div>
            <span className="text-xl font-bold text-[#0F172A]">DemoHub</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-500">{session.user.email}</span>
            <Link href="/api/auth/signout" className="px-3 py-1.5 border border-[#E5E7EB] rounded-lg text-sm text-slate-600 hover:border-slate-400">
              Log out
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">My demos</h1>
            <p className="text-slate-500 text-sm mt-1">Create and manage your interactive product demos</p>
          </div>
          <Link href="/create"
            className="px-5 py-2.5 bg-[#5B3DF5] hover:bg-[#4C2FE0] text-white rounded-xl text-sm font-semibold transition-colors">
            + New demo
          </Link>
        </div>

        <DashboardClient demos={demos as any} />
      </main>
    </div>
  );
}
