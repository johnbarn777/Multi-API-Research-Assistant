import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { scheduleResearchRun } from "@/server/research/run";
import {
  setResearchRepository,
  type ResearchRepository,
  type UpdateResearchInput
} from "@/server/repositories/researchRepository";
import type { Research, ResearchProviderState } from "@/types/research";
import { Timestamp } from "firebase-admin/firestore";

const mockOpenAi = vi.hoisted(() => ({
  executeRun: vi.fn(),
  pollResult: vi.fn()
}));

const mockGemini = vi.hoisted(() => ({
  generateContent: vi.fn()
}));

vi.mock("@/lib/providers/openaiDeepResearch", () => mockOpenAi);
vi.mock("@/lib/providers/gemini", () => mockGemini);

const executeRun = mockOpenAi.executeRun;
const pollResult = mockOpenAi.pollResult;
const generateContent = mockGemini.generateContent;

function mergeProviderState(
  current: ResearchProviderState,
  patch?: ResearchProviderState
): ResearchProviderState {
  if (!patch) {
    return current;
  }

  return {
    ...current,
    ...patch,
    questions: patch.questions ?? current.questions,
    answers: patch.answers ?? current.answers
  };
}

class StubResearchRepository implements ResearchRepository {
  public research: Research;
  private currentTime = 1_700_000_000_000;

  constructor(research: Research) {
    this.research = research;
  }

  private nextTimestamp() {
    this.currentTime += 1_000;
    return Timestamp.fromMillis(this.currentTime);
  }

  async create() {
    throw new Error("Not implemented in stub");
  }

  async update(id: string, patch: UpdateResearchInput): Promise<Research> {
    if (id !== this.research.id) {
      throw new Error("Unknown research id");
    }

    const next: Research = {
      ...this.research,
      title: patch.title?.trim() ? patch.title.trim() : this.research.title,
      status: patch.status ?? this.research.status,
      dr: mergeProviderState(this.research.dr, patch.dr),
      gemini: mergeProviderState(this.research.gemini, patch.gemini),
      report: {
        ...this.research.report,
        ...(patch.report ?? {})
      },
      updatedAt: this.nextTimestamp()
    };

    this.research = next;
    return next;
  }

  async getById(id: string): Promise<Research | null> {
    return id === this.research.id ? this.research : null;
  }

  async listByOwner() {
    throw new Error("Not implemented in stub");
  }
}

function baseResearch(): Research {
  const createdAt = Timestamp.fromMillis(1_700_000_000_000);
  return {
    id: "research-1",
    ownerUid: "user-123",
    title: "Climate strategy",
    status: "ready_to_run",
    dr: {
      sessionId: "session-abc",
      questions: [],
      answers: [],
      finalPrompt: "Refined research prompt",
      status: "idle"
    },
    gemini: {
      questions: [],
      answers: [],
      status: "idle"
    },
    report: {},
    createdAt,
    updatedAt: createdAt
  };
}

describe("scheduleResearchRun", () => {
  beforeEach(() => {
    executeRun.mockReset();
    pollResult.mockReset();
    generateContent.mockReset();
  });

  afterEach(() => {
    setResearchRepository(null);
  });

  it("transitions the research to running and records successful provider results", async () => {
    const repository = new StubResearchRepository(baseResearch());
    setResearchRepository(repository);

    const openAiResult = {
      raw: {},
      summary: "OpenAI insights",
      insights: ["Point A"],
      meta: { model: "gpt-test", tokens: 123 }
    };
    const geminiResult = {
      raw: {},
      summary: "Gemini findings",
      insights: ["Observation"],
      meta: { model: "gemini-pro", tokens: 456 }
    };

    executeRun.mockResolvedValue({ runId: "run-1", status: "queued", raw: {} });
    pollResult.mockResolvedValue({ status: "completed", result: openAiResult, raw: {} });
    generateContent.mockResolvedValue(geminiResult);

    const result = await scheduleResearchRun({
      researchId: "research-1",
      ownerUid: "user-123"
    });

    expect(result.alreadyRunning).toBe(false);
    expect(result.research.status).toBe("running");
    expect(result.research.dr.status).toBe("running");
    expect(result.research.gemini.status).toBe("running");

    await new Promise((resolve) => setTimeout(resolve, 5));

    const stored = repository.research;
    expect(stored.status).toBe("completed");
    expect(stored.dr.status).toBe("success");
    expect(stored.dr.result).toEqual(openAiResult);
    expect(stored.gemini.status).toBe("success");
    expect(stored.gemini.result).toEqual(geminiResult);
  });

  it("marks research as completed when one provider fails and the other succeeds", async () => {
    const repository = new StubResearchRepository(baseResearch());
    setResearchRepository(repository);

    const openAiResult = {
      raw: {},
      summary: "OpenAI summary",
      insights: [],
      meta: {}
    };

    executeRun.mockResolvedValue({ runId: "run-2", status: "queued", raw: {} });
    pollResult.mockResolvedValue({ status: "completed", result: openAiResult, raw: {} });
    generateContent.mockRejectedValue(new Error("Gemini service unavailable"));

    await scheduleResearchRun({
      researchId: "research-1",
      ownerUid: "user-123"
    });

    await new Promise((resolve) => setTimeout(resolve, 5));

    const stored = repository.research;
    expect(stored.status).toBe("completed");
    expect(stored.dr.status).toBe("success");
    expect(stored.gemini.status).toBe("failure");
    expect(stored.gemini.error).toMatch(/Gemini service unavailable/);
  });

  it("fails when required execution context is missing", async () => {
    const research = baseResearch();
    research.dr.finalPrompt = undefined;
    const repository = new StubResearchRepository(research);
    setResearchRepository(repository);

    await expect(
      scheduleResearchRun({
        researchId: "research-1",
        ownerUid: "user-123"
      })
    ).rejects.toMatchObject({ message: "Research does not have a final prompt to execute" });
  });
});
