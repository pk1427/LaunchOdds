import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { ToastProvider } from "@/components/Toasts";
import { SiteHeader } from "@/components/SiteHeader";
import { AutoResolve } from "@/components/AutoResolve";
import { Reconnect } from "@/lib/wallet";

const SITE = "Storyscore — HN story-score prediction markets";
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
    <html lang="en">
      <body className="font-sans">
        <Providers>
          <Reconnect />
          <ToastProvider>
            <main className="mx-auto min-h-screen max-w-[1100px] px-4 pb-6 pt-2 sm:px-6">
              <SiteHeader />
              <div className="mt-6">{children}</div>
            </main>
            <AutoResolve />
          </ToastProvider>
        </Providers>
      </body>
    </html>
  );
}
