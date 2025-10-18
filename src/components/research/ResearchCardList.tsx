import Link from "next/link";
import type { Route } from "next";
import type { ResearchListItem } from "@/types/api";
import { ResearchCard } from "./ResearchCard";

interface EmptyAction {
  href: Route;
  label: string;
}

export interface ResearchCardListProps {
  items: ResearchListItem[];
  emptyMessage: string;
  emptyAction?: EmptyAction;
}

export function ResearchCardList({ items, emptyMessage, emptyAction }: ResearchCardListProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4 rounded-md border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl leading-relaxed">{emptyMessage}</p>
        {emptyAction ? (
          <Link
            href={emptyAction.href}
            className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-slate-700 px-4 text-sm font-semibold text-slate-200 transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
          >
            {emptyAction.label}
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((research) => (
        <ResearchCard key={research.id} research={research} />
      ))}
    </div>
  );
}
