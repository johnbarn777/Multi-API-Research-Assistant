import { ResearchCardSkeleton } from "@/components/research/ResearchCard";

export default function DashboardLoading() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="h-8 w-48 rounded bg-slate-800" />
          <div className="mt-2 h-4 w-60 rounded bg-slate-800" />
        </div>
        <div className="h-9 w-32 rounded bg-brand/50" />
      </header>

      <section className="space-y-6 rounded-lg border border-slate-800 bg-slate-900/40 p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="h-5 w-32 rounded bg-slate-800" />
            <div className="h-4 w-80 rounded bg-slate-800" />
          </div>
          <div className="h-4 w-24 rounded bg-slate-800" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <ResearchCardSkeleton key={`dashboard-skeleton-${index}`} />
          ))}
        </div>
      </section>
    </main>
  );
}
