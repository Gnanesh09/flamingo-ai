import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Rubik, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";

const rubik = Rubik({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"], variable: "--font-rubik", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jbmono", display: "swap" });
import "./globals.css";

export const metadata: Metadata = {
  title: "KikoStore with Flamingo AI support",
  description:
    "Shop KikoStore and get order-aware refund and return help from Flamingo AI by text or voice. Demo with sample data and PayPal Sandbox.",
};

export const viewport: Viewport = { themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${rubik.variable} ${mono.variable}`}>
      <body className="min-h-[100dvh]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
