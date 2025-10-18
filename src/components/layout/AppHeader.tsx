"use client";

import Link from "next/link";
import { UserMenu } from "@/components/auth/UserMenu";

export function AppHeader(): JSX.Element {
  return (
    <header className="relative border-b border-slate-900/70 bg-slate-950/80 backdrop-blur">
      <a
        href="#main-content"
        className="sr-only absolute left-4 top-4 inline-flex min-h-[44px] items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white focus:not-sr-only focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950 focus:ring-brand"
      >
        Skip to main content
      </a>
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/dashboard"
          className="text-sm font-semibold text-slate-100 transition hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          Multi-API Research Assistant
        </Link>
        <UserMenu />
      </div>
    </header>
  );
}
