import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { ToastProvider } from "@/components/Toasts";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { AutoResolve } from "@/components/AutoResolve";

export const metadata: Metadata = {
  title: "LaunchOdds — HN launch prediction markets",
  description: "Bet MON on whether Show HN launches hit their score targets.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <ToastProvider>
            <main className="mx-auto min-h-screen max-w-7xl px-4 py-4">
              <SiteHeader />
              {children}
              <SiteFooter />
            </main>
            <AutoResolve />
          </ToastProvider>
        </Providers>
      </body>
    </html>
  );
}
