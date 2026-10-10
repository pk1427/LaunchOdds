import { Space_Grotesk, JetBrains_Mono } from "next/font/google";

// If the build environment cannot fetch Google Fonts, next build fails here —
// in that case delete this file's usage in layout.tsx and rely on the system
// font stacks already declared in globals.css (:root --font-sans/--font-mono).
export const grotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});
