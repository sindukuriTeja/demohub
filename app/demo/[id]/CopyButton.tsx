"use client";

export default function CopyButton({ text }: { text: string }) {
  return (
    <button
      className="btn-secondary text-sm"
      onClick={() => {
        navigator.clipboard.writeText(text);
      }}
    >
      Copy
    </button>
  );
}
