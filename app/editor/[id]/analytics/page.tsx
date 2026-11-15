"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

export const dynamic = "force-dynamic";

export default function AnalyticsPage() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<any>(null);
  const [leads, setLeads] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/analytics?demoId=${id}`).then((r) => r.json()),
      fetch(`/api/leads?demoId=${id}`).then((r) => r.json()),
    ]).then(([analytics, leads]) => {
      setData(analytics);
      setLeads(leads);
    });
  }, [id]);

  if (!data) return <div className="p-8">Loading...</div>;

  const { summary, views, demoStats } = data;

  // Views over time (last 7 days buckets)
  const byDay: Record<string, number> = {};
  views.forEach((v: any) => {
    const day = v.createdAt.slice(0, 10);
    byDay[day] = (byDay[day] || 0) + 1;
  });
  const chartData = Object.entries(byDay).map(([date, count]) => ({ date, count }));

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <button className="text-slate-500" onClick={() => window.history.back()}>← Back</button>
          <h1 className="text-xl font-bold">Analytics</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="card text-center">
            <p className="text-3xl font-bold text-brand-600">{summary.totalViews}</p>
            <p className="text-sm text-slate-500">Total Views</p>
          </div>
          <div className="card text-center">
            <p className="text-3xl font-bold text-brand-600">{summary.uniqueViewers}</p>
            <p className="text-sm text-slate-500">Unique Viewers</p>
          </div>
          <div className="card text-center">
            <p className="text-3xl font-bold text-brand-600">{summary.completionRate}%</p>
            <p className="text-sm text-slate-500">Completion Rate</p>
          </div>
          <div className="card text-center">
            <p className="text-3xl font-bold text-brand-600">{Math.round(summary.avgDuration / 60)}m</p>
            <p className="text-sm text-slate-500">Avg. Duration</p>
          </div>
          <div className="card text-center">
            <p className="text-3xl font-bold text-brand-600">{leads.length}</p>
            <p className="text-sm text-slate-500">Leads</p>
          </div>
        </div>

        {/* Views over time */}
        {chartData.length > 0 && (
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Views over time</h2>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData}>
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Viewer list */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Recent Viewers</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="pb-2 pr-4">Email</th>
                  <th className="pb-2 pr-4">Company</th>
                  <th className="pb-2 pr-4">Steps</th>
                  <th className="pb-2 pr-4">Duration</th>
                  <th className="pb-2 pr-4">Completed</th>
                  <th className="pb-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {views.slice(0, 50).map((v: any) => (
                  <tr key={v.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4">{v.viewerEmail || "—"}</td>
                    <td className="py-2 pr-4">{v.viewerCompany || "—"}</td>
                    <td className="py-2 pr-4">{v.stepsViewed}</td>
                    <td className="py-2 pr-4">{Math.round(v.duration / 60)}m {v.duration % 60}s</td>
                    <td className="py-2 pr-4">{v.completed ? "✅" : "—"}</td>
                    <td className="py-2">{v.createdAt.slice(0, 10)}</td>
                  </tr>
                ))}
                {views.length === 0 && <tr><td colSpan={6} className="py-4 text-slate-500">No views yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Leads */}
        {leads.length > 0 && (
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Captured Leads</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="pb-2 pr-4">Name</th>
                    <th className="pb-2 pr-4">Email</th>
                    <th className="pb-2 pr-4">Company</th>
                    <th className="pb-2 pr-4">Source</th>
                    <th className="pb-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l: any) => (
                    <tr key={l.id} className="border-b border-slate-100">
                      <td className="py-2 pr-4">{l.name || "—"}</td>
                      <td className="py-2 pr-4">{l.email}</td>
                      <td className="py-2 pr-4">{l.company || "—"}</td>
                      <td className="py-2 pr-4">{l.source}</td>
                      <td className="py-2">{l.createdAt.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
