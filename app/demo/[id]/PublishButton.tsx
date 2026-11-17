"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PublishButton({ id, isPublished }: { id: string; isPublished: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [published, setPublished] = useState(isPublished);

  async function toggle() {
    setLoading(true);
    await fetch(`/api/demos/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublished: !published }),
    });
    setPublished((p) => !p);
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`px-4 py-2 rounded text-sm font-semibold transition-colors disabled:opacity-60 ${
        published
          ? "bg-slate-200 hover:bg-slate-300 text-slate-700"
          : "bg-green-600 hover:bg-green-700 text-white"
      }`}
    >
      {loading ? "…" : published ? "Unpublish" : "Publish"}
    </button>
  );
}
