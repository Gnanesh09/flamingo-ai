import Link from "next/link";
import { FlamingoMark } from "@/components/brand";

export default function NotFound() {
  return (
    <div className="grid min-h-[100dvh] place-items-center px-6 text-center">
      <div>
        <FlamingoMark className="sway mx-auto h-16 w-16" />
        <p className="mt-6 font-mono text-xs uppercase tracking-[0.2em] text-primary">404</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">This page wandered off the lagoon.</h1>
        <Link href="/" className="mt-6 inline-flex rounded-full bg-foreground px-5 py-2.5 text-sm text-background">Back to shore</Link>
      </div>
    </div>
  );
}
