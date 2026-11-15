import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-brand-600 flex items-center justify-center text-white font-bold">D</div>
          <span className="text-xl font-bold">DemoHub</span>
        </div>
        <div className="flex gap-3">
          <Link href="/login" className="btn-secondary">Log in</Link>
          <Link href="/register" className="btn-primary">Start free</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 py-24 text-center">
        <h1 className="text-5xl font-extrabold tracking-tight text-slate-900 mb-6">
          Create interactive product demos <span className="text-brand-600">that sell</span>
        </h1>
        <p className="text-xl text-slate-600 mb-10 max-w-2xl mx-auto">
          Record clicks, generate clickable walkthroughs, add AI agents, and track every viewer.
          The open alternative to SupaDemo.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/register" className="btn-primary text-lg px-8 py-3">Start free — no card</Link>
          <Link href="/dashboard" className="btn-secondary text-lg px-8 py-3">See demo</Link>
        </div>
        <p className="mt-6 text-sm text-slate-500">Free forever for 1 user · 5 demos · unlimited views</p>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-16 grid md:grid-cols-3 gap-8">
        <div className="card">
          <div className="h-12 w-12 rounded-lg bg-brand-100 flex items-center justify-center text-brand-600 mb-4">🎬</div>
          <h3 className="text-lg font-semibold mb-2">Interactive Recording</h3>
          <p className="text-slate-600">Click through your product and we generate a step-by-step interactive walkthrough with hotspots.</p>
        </div>
        <div className="card">
          <div className="h-12 w-12 rounded-lg bg-brand-100 flex items-center justify-center text-brand-600 mb-4">🤖</div>
          <h3 className="text-lg font-semibold mb-2">AI Demo Agent</h3>
          <p className="text-slate-600">An AI that answers buyer questions and runs your demo on autopilot, 24/7.</p>
        </div>
        <div className="card">
          <div className="h-12 w-12 rounded-lg bg-brand-100 flex items-center justify-center text-brand-600 mb-4">📊</div>
          <h3 className="text-lg font-semibold mb-2">Analytics & Leads</h3>
          <p className="text-slate-600">Track who viewed, how far they got, and capture leads directly in your demos.</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 mt-16 py-8 text-center text-sm text-slate-500">
        DemoHub — Built as a SupaDemo alternative. MIT License.
      </footer>
    </div>
  );
}
