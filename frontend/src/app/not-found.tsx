import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
      <p className="text-sm font-semibold tracking-[0.2em] text-monad">404</p>
      <h1 className="mt-1 text-xl font-black">Page not found</h1>
      <p className="mt-1 text-sm text-slate-400">
        This route does not exist. Markets live under /markets.
      </p>
      <Link
        href="/"
        className="mt-4 inline-block rounded-xl bg-monad px-4 py-2 text-sm font-semibold text-white"
      >
        Back home
      </Link>
    </div>
  );
}
