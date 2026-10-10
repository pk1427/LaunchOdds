"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "./Logo";
import { WalletButton } from "./WalletButton";

const NAV = [
  { href: "/markets", label: "Markets" },
  { href: "/create", label: "Create" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/how-it-works", label: "How it works" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  return (
    <div className="sticky top-3 z-40">
      <div className="flex items-center justify-between gap-2 rounded-full border border-white/10 bg-[#0a0e18]/80 py-2 pl-4 pr-2 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.8)] backdrop-blur-xl">
        <Link href="/" className="flex items-center gap-2" aria-label="LaunchOdds home">
          <LogoMark />
          <span className="text-base font-black tracking-tight">
            Launch<span className="text-monad">Odds</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {NAV.map((n) => {
            const active = pathname === n.href || pathname.startsWith(n.href + "/");
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.22em] transition ${
                  active ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <WalletButton />
          <button
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-slate-300 md:hidden"
            aria-label={drawer ? "Close menu" : "Open menu"}
            aria-expanded={drawer}
            onClick={() => setDrawer(!drawer)}
          >
            ☰
          </button>
        </div>
      </div>
      {drawer && (
        <nav
          className="mt-2 flex flex-col gap-1 rounded-2xl border border-white/10 bg-[#0a0e18]/95 p-2 backdrop-blur-xl md:hidden"
          aria-label="Mobile"
        >
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setDrawer(false)}
              className="rounded-xl px-4 py-2.5 font-mono text-xs uppercase tracking-[0.22em] text-slate-300 hover:bg-white/5 hover:text-white"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
