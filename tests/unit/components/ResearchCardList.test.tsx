import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResearchCardList } from "@/components/research/ResearchCardList";
import type { ResearchListItem } from "@/types/api";

vi.mock("date-fns", () => ({
  formatDistanceToNow: vi.fn(() => "moments ago")
}));

const buildResearch = (overrides: Partial<ResearchListItem>): ResearchListItem => ({
  id: "research-id",
  ownerUid: "owner",
  title: "Sample research",
  status: "running",
  dr: { status: "running" },
  gemini: { status: "idle" },
  report: {},
  createdAt: "2024-01-05T00:00:00.000Z",
  updatedAt: "2024-01-05T00:00:00.000Z",
  ...overrides
});

describe("ResearchCardList", () => {
  it("renders empty state with call to action", () => {
    render(
      <ResearchCardList
        items={[]}
        emptyMessage="No sessions yet"
        emptyAction={{ href: "/research/new", label: "Create one" }}
      />
    );

    expect(screen.getByText("No sessions yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create one" })).toHaveAttribute(
      "href",
      "/research/new"
    );
  });

  it("renders research cards when items exist", () => {
    const items = [
      buildResearch({ id: "research-1", title: "First research" }),
      buildResearch({ id: "research-2", title: "Second research" })
    ];

    render(
      <ResearchCardList
        items={items}
        emptyMessage="No sessions yet"
        emptyAction={{ href: "/research/new", label: "Create one" }}
      />
    );

    expect(screen.getByText("First research")).toBeInTheDocument();
    expect(screen.getByText("Second research")).toBeInTheDocument();
    expect(screen.queryByText("No sessions yet")).not.toBeInTheDocument();
  });
});
