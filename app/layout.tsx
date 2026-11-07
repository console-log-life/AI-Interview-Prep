import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Outfit } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

/**
 * Display face for headings.
 *
 * Outfit is geometric and a little warmer than Inter, which is what makes a
 * large page title read as confident rather than as a bigger paragraph. It is
 * close enough in proportion to Inter that the two do not fight at the sizes
 * where they meet, and it stays legible down to the 20px section headings —
 * which ruled out the more characterful grotesques that only work huge.
 *
 * Headings opt in through `--font-display`, applied to h1-h3 in globals.css
 * rather than per component, so a new page cannot ship with body type in its
 * title.
 */
const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "PrepPilot — Practice smarter. Interview better.",
    template: "%s · PrepPilot",
  },
  description:
    "AI-powered mock interviews, assessments, coding practice, and personalized feedback in one platform.",
  applicationName: "PrepPilot",
  authors: [{ name: "PrepPilot" }],
  keywords: [
    "mock interview",
    "interview preparation",
    "placement preparation",
    "coding practice",
    "aptitude test",
    "resume analysis",
  ],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${outfit.variable} ${jetbrainsMono.variable} font-sans`}
      >
        {/* First tab stop on every page — lets keyboard users skip the nav. */}
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <SessionProvider>
          {children}
          <Toaster
            position="top-right"
            richColors
            closeButton
            toastOptions={{ duration: 5000 }}
          />
        </SessionProvider>
      </body>
    </html>
  );
}
