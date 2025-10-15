export type ResearchStatus =
  | "awaiting_refinements"
  | "refining"
  | "ready_to_run"
  | "running"
  | "completed"
  | "failed";

const allowedTransitions: Record<ResearchStatus, ResearchStatus[]> = {
  awaiting_refinements: ["refining", "failed"],
  refining: ["ready_to_run", "failed"],
  ready_to_run: ["running", "failed"],
  running: ["completed", "failed"],
  completed: [],
  failed: []
};

export function canTransition(current: ResearchStatus, next: ResearchStatus) {
  return allowedTransitions[current]?.includes(next) ?? false;
}
