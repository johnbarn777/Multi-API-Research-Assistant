import { describe, expect, it } from "vitest";
import { canTransition } from "@/server/research/state-machine";

describe("state machine", () => {
  it("allows valid transitions", () => {
    expect(canTransition("awaiting_refinements", "refining")).toBe(true);
    expect(canTransition("running", "completed")).toBe(true);
    expect(canTransition("completed", "running")).toBe(true);
    expect(canTransition("failed", "running")).toBe(true);
  });

  it("blocks invalid transitions", () => {
    expect(canTransition("awaiting_refinements", "completed")).toBe(false);
    expect(canTransition("failed", "completed")).toBe(false);
  });
});
