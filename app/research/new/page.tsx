"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useSWRConfig } from "swr";
import { useAuth } from "@/lib/firebase/auth-context";
import {
  ApiError,
  createResearch,
  type CreateResearchResponse,
  type ListResearchResponse
} from "@/lib/api/researchClient";
import { researchListKey } from "@/hooks/useResearchList";

export default function NewResearchPage() {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { token, loading } = useAuth();

  const [title, setTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    const trimmed = title.trim();
    if (!trimmed) {
      setError("Please enter a research topic.");
      return;
    }

    if (!token) {
      setError("Authentication required. Please sign in again.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await createResearch({ token, title: trimmed });

      await updateDashboardCache(token, response);

      router.push(`/research/${response.item.id}`);
    } catch (caught) {
      const message =
        caught instanceof ApiError
          ? caught.message
          : "Something went wrong while creating your research session.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function updateDashboardCache(tokenValue: string, response: CreateResearchResponse) {
    const key = researchListKey(tokenValue);
    if (!key) {
      return;
    }

    await mutate<ListResearchResponse>(
      key,
      (current) => {
        const existingItems = current?.items ?? [];
        const withoutDuplicate = existingItems.filter((item) => item.id !== response.item.id);
        return {
          items: [response.item, ...withoutDuplicate],
          nextCursor: current?.nextCursor ?? null
        };
      },
      { revalidate: true, populateCache: true, rollbackOnError: true }
    );
  }

  const disabled = isSubmitting || loading;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-12">
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Link href="/dashboard" className="text-brand underline">
          Dashboard
        </Link>
        <span>/</span>
        <span>New Research</span>
      </div>
      <section className="space-y-6 rounded-lg border border-slate-800 bg-slate-900/50 p-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold text-white">Create a research session</h1>
          <p className="text-sm text-slate-400">
            Start the OpenAI Deep Research refinement loop by sharing your topic. We will guide you through follow-up
            questions before running both providers.
          </p>
        </header>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label htmlFor="topic" className="text-sm font-medium text-slate-200">
              Research topic
            </label>
            <input
              id="topic"
              name="topic"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={disabled}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="e.g., Responsible AI policies in healthcare"
              autoFocus
            />
            <p className="text-xs text-slate-500">
              We automatically start an OpenAI Deep Research session and save the initial refinement questions for you.
            </p>
            {error ? (
              <p className="text-sm text-red-400">{error}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={disabled}
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Starting..." : "Start Refinement"}
            </button>
            <span className="text-xs text-slate-500">
              {loading
                ? "Loading your session…"
                : "You can answer refinement questions immediately after creation."}
            </span>
          </div>
        </form>
      </section>
    </main>
  );
}
