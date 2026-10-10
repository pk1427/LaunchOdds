"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-no/40 bg-no/10 p-8 text-center">
      <h1 className="text-xl font-black">Something broke</h1>
      <p className="mt-1 break-words font-mono text-xs text-slate-400">
        {error.message.slice(0, 200) || "Unexpected render error."}
      </p>
      <button
        onClick={reset}
        className="mt-4 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20"
      >
        Try again
      </button>
    </div>
  );
}
