import clsx from "clsx";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import type { ResearchListItem } from "@/types/api";

const STATUS_STYLES: Record<ResearchListItem["status"], string> = {
  awaiting_refinements: "border-amber-500/70 text-amber-300",
  refining: "border-blue-500/70 text-blue-300",
  ready_to_run: "border-indigo-500/70 text-indigo-300",
  running: "border-cyan-500/70 text-cyan-300",
  completed: "border-emerald-500/70 text-emerald-300",
  failed: "border-rose-500/70 text-rose-300"
};

function formatStatus(status: ResearchListItem["status"]) {
  return status
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatCreatedAt(iso: string) {
  if (!iso) {
    return "Unknown date";
  }

  const createdDate = new Date(iso);
  if (Number.isNaN(createdDate.getTime())) {
    return "Unknown date";
  }

  return formatDistanceToNow(createdDate, { addSuffix: true });
}

export interface ResearchCardProps {
  research: ResearchListItem;
}

export function ResearchCard({ research }: ResearchCardProps) {
  const statusLabel = formatStatus(research.status);
  const createdLabel = formatCreatedAt(research.createdAt);

  return (
    <article className="group flex flex-col gap-4 rounded-lg border border-slate-800 bg-slate-900/60 p-5 transition hover:border-slate-700 focus-within:border-slate-600">
      <div className="space-y-2">
        <Link
          href={`/research/${research.id}`}
          className="inline-flex min-h-[44px] items-center text-lg font-semibold text-slate-100 transition hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
        >
          {research.title}
        </Link>
        <p className="text-xs text-slate-500 sm:text-sm">Created {createdLabel}</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span
          className={clsx(
            "inline-flex h-8 items-center justify-center rounded-full border px-4 text-xs font-medium uppercase tracking-wide",
            STATUS_STYLES[research.status]
          )}
        >
          {statusLabel}
        </span>
        <Link
          href={`/research/${research.id}`}
          aria-label={`View details for ${research.title}`}
          className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-slate-700 px-4 text-sm font-semibold text-slate-200 transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
        >
          View details
        </Link>
      </div>
    </article>
  );
}

export function ResearchCardSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-slate-800 bg-slate-900/50 p-5">
      <div className="h-5 w-3/4 rounded bg-slate-800" />
      <div className="h-3 w-1/3 rounded bg-slate-800" />
      <div className="h-8 w-24 rounded-full border border-slate-800 bg-slate-800/50" />
    </div>
  );
}
