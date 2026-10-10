import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { ToastProvider } from "@/components/Toasts";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { AutoResolve } from "@/components/AutoResolve";
import { Reconnect } from "@/lib/wallet";
import { grotesk, mono } from "@/lib/fonts";

const SITE = "LaunchOdds — HN launch prediction markets";
const DESC =
  "Parimutuel prediction markets on Hacker News launch scores. Monad testnet demo — unaudited, trusted resolver.";

export const metadata: Metadata = {
  title: SITE,
  description: DESC,
  openGraph: {
    title: SITE,
    description: DESC,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: SITE,
    description: DESC,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${grotesk.variable} ${mono.variable}`}>
      <body className="font-sans">
        <Providers>
          <Reconnect />
          <ToastProvider>
            <main className="mx-auto min-h-screen max-w-7xl px-4 pb-6 pt-2 sm:px-6">
              <SiteHeader />
              <div className="mt-6">{children}</div>
              <SiteFooter />
            </main>
            <AutoResolve />
          </ToastProvider>
        </Providers>
      </body>
    </html>
  );
}
