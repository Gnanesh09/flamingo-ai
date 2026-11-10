import type { ReactNode } from "react";
import { CommerceRoot } from "@/components/commerce/shell";
import "../commerce.css";

export default function Layout({ children }: { children: ReactNode }) {
  return <CommerceRoot surface="store">{children}</CommerceRoot>;
}
