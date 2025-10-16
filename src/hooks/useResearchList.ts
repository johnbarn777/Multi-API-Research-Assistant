"use client";

import useSWR from "swr";
import { useAuth } from "@/lib/firebase/auth-context";
import {
  listResearch,
  type ListResearchResponse
} from "@/lib/api/researchClient";

const DEFAULT_LIMIT = 20;

export type ResearchListKey = readonly ["research:list", string, number];

export function researchListKey(token: string | null, limit = DEFAULT_LIMIT): ResearchListKey | null {
  return token ? (["research:list", token, limit] as const) : null;
}

async function fetchResearchList([, token, limit]: ResearchListKey) {
  return listResearch({ token, limit });
}

export function useResearchList(options?: { limit?: number }) {
  const { token } = useAuth();
  const limit = options?.limit ?? DEFAULT_LIMIT;
  const key = researchListKey(token, limit);

  const { data, error, isLoading, mutate, isValidating } = useSWR<ListResearchResponse>(
    key,
    fetchResearchList,
    {
      revalidateOnFocus: false,
      keepPreviousData: true
    }
  );

  return {
    items: data?.items ?? [],
    nextCursor: data?.nextCursor ?? null,
    isLoading: Boolean(token) && (isLoading || (!data && isValidating)),
    error,
    mutate
  };
}
