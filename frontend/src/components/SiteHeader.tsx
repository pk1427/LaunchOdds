"use client";

import { useState, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import { WalletButton } from "./WalletButton";
import { ConnectModal } from "./ConnectModal";

const NAV = [
  { href: "/markets", label: "Markets" },
  { href: "/create", label: "Create" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/how-it-works", label: "How it works" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const { isConnected } = useAccount();
  const needsWallet = (href: string) => href === "/create" || href === "/portfolio";
  const guardRoute = (href: string, event: MouseEvent<HTMLAnchorElement>) => {
    if (!isConnected && needsWallet(href)) {
      event.preventDefault();
      setDrawer(false);
      setConnectOpen(true);
    }
  };
  return (
    <div className="sticky top-3 z-40">
      <div className="flex items-center justify-between gap-2 rounded-full border border-white/10 bg-[#0a0e18]/80 py-2 pl-4 pr-2 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.8)] backdrop-blur-xl">
        <Link href="/" className="flex items-center gap-2" aria-label="LaunchOdds home">
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
                onClick={(event) => guardRoute(n.href, event)}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 text-sm transition ${
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
            <span className="text-xs font-semibold uppercase tracking-wider">{drawer ? "Close" : "Menu"}</span>
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
              onClick={(event) => guardRoute(n.href, event)}
              className="rounded-xl px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      )}
      <ConnectModal open={connectOpen} onClose={() => setConnectOpen(false)} />
    </div>
  );
}
