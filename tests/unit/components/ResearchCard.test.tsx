import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResearchCard } from "@/components/research/ResearchCard";
import type { ResearchListItem } from "@/types/api";

vi.mock("date-fns", () => ({
  formatDistanceToNow: vi.fn(() => "2 hours ago")
}));

const baseResearch: ResearchListItem = {
  id: "research-123",
  ownerUid: "user-1",
  title: "AI readiness in healthcare",
  status: "completed",
  dr: { status: "success" },
  gemini: { status: "success" },
  report: { emailStatus: "sent" },
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:05:00.000Z"
};

describe("ResearchCard", () => {
  it("renders research details with status badge", () => {
    render(<ResearchCard research={baseResearch} />);

    expect(screen.getByRole("link", { name: baseResearch.title })).toHaveAttribute(
      "href",
      `/research/${baseResearch.id}`
    );
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("View details")).toHaveAttribute(
      "href",
      `/research/${baseResearch.id}`
    );

    const statusPill = screen.getByText("Completed");
    expect(statusPill.className).toContain("border-emerald-500/70");
  });

  it("falls back to unknown date when createdAt is invalid", () => {
    const invalidResearch = { ...baseResearch, createdAt: "invalid-date" };
    render(<ResearchCard research={invalidResearch} />);

    expect(screen.getByText(/Unknown date/i)).toBeInTheDocument();
  });
});
