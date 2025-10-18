import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_HEADER_TOKEN } from "@/server/auth/session";
import { ResearchCardList } from "@/components/research/ResearchCardList";
import type { ListResearchResponse } from "@/types/api";

const PAGE_SIZE = 20;

class DashboardDataError extends Error {}

function buildBaseUrl(headerList: Headers) {
  const host = headerList.get("host");
  if (!host) {
    throw new DashboardDataError("Unable to determine request host.");
  }

  const protocol = headerList.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}

async function fetchResearchPage(cursor?: string): Promise<ListResearchResponse> {
  const cookieStore = cookies();
  const fixtureCookie =
    process.env.NODE_ENV !== "production" ? cookieStore.get("__dashboard_fixture") : null;

  if (fixtureCookie?.value) {
    try {
      const decoded = Buffer.from(fixtureCookie.value, "base64").toString("utf8");
      const parsed = JSON.parse(decoded) as ListResearchResponse;
      return parsed;
    } catch {
      // Ignore malformed fixtures and fall back to live data.
    }
  }

  const headerList = headers();
  const token = headerList.get(AUTH_HEADER_TOKEN);

  if (!token) {
    redirect("/sign-in?redirectedFrom=/dashboard");
  }

  const baseUrl = buildBaseUrl(headerList);
  const url = new URL("/api/research", baseUrl);
  url.searchParams.set("limit", String(PAGE_SIZE));
  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    cache: "no-store",
    next: {
      revalidate: 0
    }
  });

  if (response.status === 401) {
    redirect("/sign-in?redirectedFrom=/dashboard");
  }

  if (!response.ok) {
    let message = "Failed to load research sessions.";
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) {
        message = body.error;
      }
    } catch {
      // Ignore JSON parse errors; fall back to generic message.
    }
    throw new DashboardDataError(message);
  }

  return (await response.json()) as ListResearchResponse;
}

export const dynamic = "force-dynamic";

interface DashboardPageProps {
  searchParams?: {
    cursor?: string | string[];
  };
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const cursorParam = searchParams?.cursor;
  const cursor = Array.isArray(cursorParam) ? cursorParam[0] : cursorParam;

  let data: ListResearchResponse = { items: [], nextCursor: null };
  let errorMessage: string | null = null;

  try {
    data = await fetchResearchPage(cursor);
  } catch (error) {
    if (error instanceof DashboardDataError) {
      errorMessage = error.message;
    } else {
      throw error;
    }
  }

  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-12"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-white sm:text-4xl">Dashboard</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400 sm:text-base">
            Track research progress, revisit refinement questions, and jump back into completed reports.
          </p>
        </div>
        <Link
          href="/research/new"
          className="inline-flex min-h-[44px] w-full items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 sm:w-auto"
        >
          New Research
        </Link>
      </header>

      <section className="space-y-6 rounded-lg border border-slate-800 bg-slate-900/40 p-5 sm:p-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white sm:text-xl">Recent Research</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">
              Sessions are sorted by creation date. We keep provider snapshots so you can resume seamlessly.
            </p>
          </div>
          <Link
            href="/research/new"
            className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-transparent px-3 text-sm font-semibold text-brand underline transition hover:text-brand/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 sm:px-4"
          >
            Start another
          </Link>
        </header>

        {errorMessage ? (
          <div className="rounded-md border border-rose-500/60 bg-rose-500/10 p-4 text-sm text-rose-200">
            {errorMessage}
          </div>
        ) : null}

        <ResearchCardList
          items={data.items}
          emptyMessage="You have not created any research sessions yet. Start one to see it appear here instantly."
          emptyAction={{
            href: "/research/new",
            label: "Start your first research"
          }}
        />

        {data.nextCursor && data.items.length > 0 ? (
          <div className="flex justify-end">
            <Link
              href={`/dashboard?cursor=${encodeURIComponent(data.nextCursor)}`}
              className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-slate-700 px-4 text-sm font-semibold text-slate-200 transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
            >
              Load older sessions
            </Link>
          </div>
        ) : null}
      </section>
    </main>
  );
}
