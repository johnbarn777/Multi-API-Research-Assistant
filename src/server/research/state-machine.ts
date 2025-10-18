import type { ResearchStatus } from "@/types/research";

export const RESEARCH_ALLOWED_TRANSITIONS: Record<ResearchStatus, ReadonlySet<ResearchStatus>> = {
  awaiting_refinements: new Set(["refining", "ready_to_run", "failed"]),
  refining: new Set(["ready_to_run", "failed"]),
  ready_to_run: new Set(["running", "failed"]),
  running: new Set(["completed", "failed"]),
  completed: new Set(),
  failed: new Set()
};

export function canTransition(current: ResearchStatus, next: ResearchStatus) {
  return RESEARCH_ALLOWED_TRANSITIONS[current]?.has(next) ?? false;
}

export function assertCanTransition(current: ResearchStatus, next: ResearchStatus): void {
  if (!canTransition(current, next)) {
    throw new Error(`Cannot transition research from ${current} to ${next}`);
  }
}
