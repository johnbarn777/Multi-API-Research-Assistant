"use client";

import clsx from "clsx";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { useMemo } from "react";
import { useAuth } from "@/lib/firebase/auth-context";
import { useResearchList } from "@/hooks/useResearchList";
import type { ResearchStatus } from "@/types/research";

const STATUS_STYLES: Record<ResearchStatus, string> = {
  awaiting_refinements: "border-amber-500/70 text-amber-300",
  refining: "border-blue-500/70 text-blue-300",
  ready_to_run: "border-indigo-500/70 text-indigo-300",
  running: "border-cyan-500/70 text-cyan-300",
  completed: "border-emerald-500/70 text-emerald-300",
  failed: "border-rose-500/70 text-rose-300"
};

function formatStatus(status: ResearchStatus) {
  return status
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function getCreatedLabel(iso: string) {
  const createdDate = new Date(iso);
  if (Number.isNaN(createdDate.getTime())) {
    return "Unknown date";
  }

  return `${formatDistanceToNow(createdDate, { addSuffix: true })}`;
}

export default function DashboardPage() {
  const { loading: authLoading } = useAuth();
  const { items, isLoading, error } = useResearchList();

  const showSkeleton = authLoading || isLoading;
  const empty = !showSkeleton && items.length === 0 && !error;

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [items]
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Dashboard</h1>
          <p className="text-sm text-slate-400">
            Track your research sessions, continue answering refinement questions, or jump back into completed reports.
          </p>
        </div>
        <Link
          href="/research/new"
          className="inline-flex items-center justify-center rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand/90"
        >
          New Research
        </Link>
      </header>
      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-6">
        <header className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Recent Research</h2>
            <p className="text-sm text-slate-400">Newest sessions appear first. We keep snapshots of provider progress.</p>
          </div>
          <Link href="/research/new" className="text-sm font-medium text-brand underline">
            Start another
          </Link>
        </header>
        {error ? (
          <div className="rounded-md border border-rose-500/60 bg-rose-500/10 p-4 text-sm text-rose-200">
            {error instanceof Error ? error.message : "Failed to load research sessions."}
          </div>
        ) : null}
        {showSkeleton ? (
          <ul className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <li
                // eslint-disable-next-line react/no-array-index-key
                key={index}
                className="animate-pulse rounded-md border border-slate-800 bg-slate-900/50 p-4"
              >
                <div className="mb-3 h-4 w-2/3 rounded bg-slate-800" />
                <div className="h-3 w-1/3 rounded bg-slate-800" />
              </li>
            ))}
          </ul>
        ) : null}
        {empty ? (
          <div className="rounded-md border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-400">
            You have not created any research sessions yet. Start one to see it appear here instantly.
          </div>
        ) : null}
        {!showSkeleton && !empty ? (
          <ul className="space-y-3">
            {sortedItems.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-3 rounded-md border border-slate-800 bg-slate-900/60 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <Link href={`/research/${item.id}`} className="font-semibold text-slate-100 hover:text-brand">
                    {item.title}
                  </Link>
                  <p className="text-xs text-slate-500">Created {getCreatedLabel(item.createdAt)}</p>
                </div>
                <div className="flex flex-col gap-2 text-sm text-slate-400 sm:flex-row sm:items-center sm:gap-4">
                  <span
                    className={clsx(
                      "inline-flex h-8 items-center justify-center rounded-full border px-4 text-xs uppercase tracking-wide",
                      STATUS_STYLES[item.status]
                    )}
                  >
                    {formatStatus(item.status)}
                  </span>
                  <Link
                    href={`/research/${item.id}`}
                    className="inline-flex items-center justify-center rounded-md border border-slate-700 px-4 py-2 text-xs font-medium text-slate-200 transition hover:border-brand hover:text-brand"
                  >
                    View details
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </main>
  );
}
