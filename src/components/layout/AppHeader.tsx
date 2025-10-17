"use client";

import Link from "next/link";
import { UserMenu } from "@/components/auth/UserMenu";

export function AppHeader(): JSX.Element {
  return (
    <header className="border-b border-slate-900/70 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <Link
          href="/"
          className="text-sm font-semibold text-slate-100 transition hover:text-brand"
        >
          Multi-API Research Assistant
        </Link>
        <UserMenu />
      </div>
    </header>
  );
}
