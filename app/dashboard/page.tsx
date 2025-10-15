"use client";

import Link from "next/link";
import { useMemo } from "react";

export default function DashboardPage() {
  // Placeholder data until Firestore integration is implemented.
  const mockItems = useMemo(
    () => [
      {
        id: "placeholder-1",
        title: "Assess the impact of AI on climate modeling",
        status: "awaiting_refinements",
        createdAt: new Date().toISOString()
      },
      {
        id: "placeholder-2",
        title: "AI policy updates in the EU for 2025",
        status: "completed",
        createdAt: new Date(Date.now() - 86400000).toISOString()
      }
    ],
    []
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Dashboard</h1>
          <p className="text-sm text-slate-400">
            Signed-in user will see research sessions here once Firebase integration is wired up.
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
        <h2 className="text-lg font-semibold">Recent Research</h2>
        <p className="mb-4 text-sm text-slate-400">
          This list is currently mocked for layout purposes. Replace with Firestore-backed data source.
        </p>
        <ul className="space-y-3">
          {mockItems.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-2 rounded-md border border-slate-800 bg-slate-900/60 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium">{item.title}</p>
                <span className="text-xs text-slate-500">
                  Created {new Date(item.createdAt).toLocaleString()}
                </span>
              </div>
              <span className="inline-flex h-8 items-center justify-center rounded-full border border-slate-700 px-4 text-xs uppercase tracking-wide text-slate-300">
                {item.status}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
