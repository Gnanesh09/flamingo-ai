import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Invoice conversation",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ResolveLayout({ children }: { children: ReactNode }) {
  return children;
}
