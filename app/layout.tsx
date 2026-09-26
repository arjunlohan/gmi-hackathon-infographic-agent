import type { Metadata } from "next";
import { Geist, Geist_Mono, Oswald } from "next/font/google";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import "./globals.css";

const sans = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});

const display = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});

const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Plate · Infographic studio",
  description:
    "Turn any article, document, or idea into a publication-grade infographic. Muse Spark plans and fact-checks; Hy Image 3.5 on GMI Cloud renders.",
};

// The page and Eve routes validate the generated app's Better Auth session.
export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html
      className={cn(sans.variable, mono.variable, display.variable)}
      lang="en"
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" disableTransitionOnChange enableSystem>
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
