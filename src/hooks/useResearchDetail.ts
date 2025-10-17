"use client";

import useSWR from "swr";
import { useAuth } from "@/lib/firebase/auth-context";
import {
  getResearch,
  type ResearchResponse
} from "@/lib/api/researchClient";

export type ResearchDetailKey = readonly ["research:detail", string, string];

export function researchDetailKey(token: string | null, id: string | null): ResearchDetailKey | null {
  return token && id ? (["research:detail", token, id] as const) : null;
}

async function fetchResearchDetail([, token, id]: ResearchDetailKey) {
  return getResearch({ token, id });
}

export function useResearchDetail(id: string | null) {
  const { token } = useAuth();
  const key = researchDetailKey(token, id);

  const { data, error, isLoading, mutate, isValidating } = useSWR<ResearchResponse>(
    key,
    fetchResearchDetail,
    {
      revalidateOnFocus: false,
      refreshInterval(latestData) {
        if (!latestData?.item) {
          return 0;
        }

        return latestData.item.status === "running" ? 2500 : 0;
      }
    }
  );

  return {
    item: data?.item ?? null,
    isLoading: Boolean(token) && (isLoading || (!data && isValidating)),
    error,
    mutate
  };
}
