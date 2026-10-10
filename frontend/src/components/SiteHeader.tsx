"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "./WalletButton";

const NAV = [
  { href: "/markets", label: "Markets" },
  { href: "/create", label: "Create" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/how-it-works", label: "How it works" },
];

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/" className="text-2xl font-black tracking-tight">
          Launch<span className="text-monad">Odds</span>
        </Link>
        <WalletButton />
      </div>
      <nav className="mt-2 flex gap-1 overflow-x-auto text-sm">
        {NAV.map((n) => {
          const active = pathname === n.href || pathname.startsWith(n.href + "/");
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 font-semibold ${
                active ? "bg-monad text-white" : "text-gray-300 hover:bg-white/10"
              }`}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
