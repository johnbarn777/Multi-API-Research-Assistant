import type { Research } from "@/types/research";

export function serializeResearch(research: Research) {
  return {
    ...research,
    createdAt: research.createdAt.toDate().toISOString(),
    updatedAt: research.updatedAt.toDate().toISOString()
  };
}
