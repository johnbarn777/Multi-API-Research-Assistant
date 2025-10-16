import express from "express";
import request from "supertest";
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { middleware } from "../../middleware";
import { GET, POST } from "../../app/api/research/route";
import { GET as GET_BY_ID } from "../../app/api/research/[id]/route";
import { POST as POST_ANSWER } from "../../app/api/research/[id]/openai/answer/route";
import { AUTH_HEADER_UID, ForbiddenError } from "@/server/auth/session";
import {
  type ResearchRepository,
  type PaginatedResearchResult,
  type CreateResearchInput,
  type UpdateResearchInput,
  setResearchRepository
} from "@/server/repositories/researchRepository";
import type { Research } from "@/types/research";
import { Timestamp } from "firebase-admin/firestore";

const mockTokenVerifier = vi.hoisted(() => ({
  verifyFirebaseIdToken: vi.fn()
}));

const mockOpenAiDeepResearch = vi.hoisted(() => ({
  startSession: vi.fn(),
  submitAnswer: vi.fn()
}));

vi.mock("@/lib/firebase/tokenVerifier", () => mockTokenVerifier);
vi.mock("@/lib/providers/openaiDeepResearch", () => mockOpenAiDeepResearch);

const verifyFirebaseIdToken = mockTokenVerifier.verifyFirebaseIdToken;
const startSession = mockOpenAiDeepResearch.startSession;
const submitAnswer = mockOpenAiDeepResearch.submitAnswer;

class InMemoryResearchRepository implements ResearchRepository {
  private store: Research[] = [];
  private counter = 0;
  private currentTime = 1_700_000_000_000;

  private nextTimestamp() {
    this.currentTime += 1_000;
    return Timestamp.fromMillis(this.currentTime);
  }

  private encodeCursor(research: Research) {
    const payload = JSON.stringify({
      createdAt: research.createdAt.toMillis(),
      id: research.id
    });
    return Buffer.from(payload, "utf8").toString("base64");
  }

  private decodeCursor(cursor: string) {
    const decoded = Buffer.from(cursor, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as { createdAt: number; id: string };
    if (typeof parsed.createdAt !== "number" || typeof parsed.id !== "string") {
      throw new Error("Invalid cursor");
    }
    return parsed;
  }

  async create(input: CreateResearchInput): Promise<Research> {
    const now = this.nextTimestamp();
    const research: Research = {
      id: `research-${++this.counter}`,
      ownerUid: input.ownerUid,
      title: input.title.trim(),
      status: input.status ?? "awaiting_refinements",
      dr: input.dr ?? { questions: [], answers: [] },
      gemini: input.gemini ?? { questions: [], answers: [] },
      report: input.report ?? {},
      createdAt: now,
      updatedAt: now
    };

    this.store.push(research);
    return research;
  }

  async update(id: string, update: UpdateResearchInput, options?: { ownerUid?: string }): Promise<Research> {
    const index = this.store.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new Error(`Research ${id} not found`);
    }

    const current = this.store[index];

    if (options?.ownerUid && current.ownerUid !== options.ownerUid) {
      throw new ForbiddenError("You do not have access to this research");
    }

    const next: Research = {
      ...current,
      title: update.title?.trim() ? update.title.trim() : current.title,
      status: update.status ?? current.status,
      dr: {
        ...current.dr,
        ...(update.dr ?? {}),
        questions: update.dr?.questions ?? current.dr.questions,
        answers: update.dr?.answers ?? current.dr.answers
      },
      gemini: {
        ...current.gemini,
        ...(update.gemini ?? {}),
        questions: update.gemini?.questions ?? current.gemini.questions,
        answers: update.gemini?.answers ?? current.gemini.answers
      },
      report: {
        ...current.report,
        ...(update.report ?? {})
      },
      updatedAt: this.nextTimestamp()
    };

    this.store[index] = next;
    return next;
  }

  async getById(id: string, options?: { ownerUid?: string }): Promise<Research | null> {
    const found = this.store.find((item) => item.id === id);
    if (!found) {
      return null;
    }

    if (options?.ownerUid && found.ownerUid !== options.ownerUid) {
      throw new ForbiddenError("You do not have access to this research");
    }

    return found;
  }

  async listByOwner(ownerUid: string, options?: { limit?: number; cursor?: string | null }): Promise<PaginatedResearchResult> {
    const limit = Math.min(Math.max(options?.limit ?? 20, 1), 50);
    const sorted = this.store
      .filter((item) => item.ownerUid === ownerUid)
      .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());

    let startIndex = 0;
    if (options?.cursor) {
      const { createdAt, id } = this.decodeCursor(options.cursor);
      const index = sorted.findIndex(
        (item) => item.createdAt.toMillis() === createdAt && item.id === id
      );
      startIndex = index >= 0 ? index + 1 : sorted.length;
    }

    const pageItems = sorted.slice(startIndex, startIndex + limit);
    const nextItem = sorted[startIndex + limit];

    return {
      items: pageItems,
      nextCursor: nextItem ? this.encodeCursor(nextItem) : null
    };
  }
}

function headersFromNode(headers: NodeJS.Dict<string | string[]>) {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (typeof value === "string") {
      result.set(key, value);
    } else if (Array.isArray(value)) {
      result.set(key, value.join(","));
    }
  }
  return result;
}

async function applyNextResponse(res: express.Response, nextResponse: NextResponse) {
  nextResponse.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  const body = await nextResponse.text();
  res.status(nextResponse.status).send(body);
}

function createApp() {
  const app = express();

  app.use(express.json());

  app.use(async (req, res, next) => {
    const url = new URL(req.originalUrl || req.url, `http://${req.headers.host ?? "localhost"}`);
    const nextRequest = new NextRequest(url, {
      method: req.method,
      headers: headersFromNode(req.headers as Record<string, string | string[]>)
    });

    const response = await middleware(nextRequest);
    const shouldContinue = response.headers.get("x-middleware-next") === "1";

    if (!shouldContinue) {
      await applyNextResponse(res, response);
      return;
    }

    const encodedHeaders = response.headers.get("x-middleware-request-headers");
    if (encodedHeaders) {
      const overrides = JSON.parse(
        Buffer.from(encodedHeaders, "base64").toString("utf8")
      ) as Record<string, string>;

      for (const [key, value] of Object.entries(overrides)) {
        req.headers[key.toLowerCase()] = value;
      }
    }

    const overrideKeys = response.headers.get("x-middleware-override-headers");
    if (overrideKeys) {
      for (const key of overrideKeys.split(",")) {
        const value = response.headers.get(`x-middleware-request-${key}`);
        if (value) {
          req.headers[key.toLowerCase()] = value;
        }
      }
    }

    next();
  });

  app.get("/api/research", async (req, res) => {
    const url = new URL(req.originalUrl || req.url, `http://${req.headers.host ?? "localhost"}`);
    const nextReq = new NextRequest(url, {
      method: "GET",
      headers: headersFromNode(req.headers as Record<string, string | string[]>)
    });

    const response = await GET(nextReq);
    await applyNextResponse(res, response);
  });

  app.get("/api/research/:id", async (req, res) => {
    const url = new URL(req.originalUrl || req.url, `http://${req.headers.host ?? "localhost"}`);
    const nextReq = new NextRequest(url, {
      method: "GET",
      headers: headersFromNode(req.headers as Record<string, string | string[]>)
    });

    const response = await GET_BY_ID(nextReq, { params: { id: req.params.id } });
    await applyNextResponse(res, response);
  });

  app.post("/api/research", async (req, res) => {
    const url = new URL(req.originalUrl || req.url, `http://${req.headers.host ?? "localhost"}`);
    const nextReq = new NextRequest(url, {
      method: "POST",
      headers: headersFromNode(req.headers as Record<string, string | string[]>),
      body: JSON.stringify(req.body ?? {})
    });

    const response = await POST(nextReq);
    await applyNextResponse(res, response);
  });

  app.post("/api/research/:id/openai/answer", async (req, res) => {
    const url = new URL(req.originalUrl || req.url, `http://${req.headers.host ?? "localhost"}`);
    const nextReq = new NextRequest(url, {
      method: "POST",
      headers: headersFromNode(req.headers as Record<string, string | string[]>),
      body: JSON.stringify(req.body ?? {})
    });

    const response = await POST_ANSWER(nextReq, { params: { id: req.params.id } });
    await applyNextResponse(res, response);
  });

  return app;
}

describe("API /api/research", () => {
  let repository: InMemoryResearchRepository;

  beforeEach(() => {
    verifyFirebaseIdToken.mockReset();
    startSession.mockReset();
    submitAnswer.mockReset();
    repository = new InMemoryResearchRepository();
    setResearchRepository(repository);
  });

  afterEach(() => {
    setResearchRepository(null);
  });

  it("returns 401 when authorization is missing", async () => {
    const app = createApp();

    const response = await request(app).get("/api/research").expect(401);

    expect(response.body).toEqual({ error: "Unauthorized" });
    expect(verifyFirebaseIdToken).not.toHaveBeenCalled();
  });

  it("returns a paginated list for the authenticated user", async () => {
    verifyFirebaseIdToken.mockResolvedValue({
      uid: "test-user",
      email: "user@example.com"
    });
    startSession.mockResolvedValue({
      sessionId: "session-123",
      questions: [
        { index: 1, text: "First question?" }
      ],
      raw: {}
    });
    const app = createApp();

    // Seed data via POST
    await request(app)
      .post("/api/research")
      .set("Authorization", "Bearer valid-token")
      .send({ title: "First" })
      .expect(201);

    await request(app)
      .post("/api/research")
      .set("Authorization", "Bearer valid-token")
      .send({ title: "Second" })
      .expect(201);

    const response = await request(app)
      .get("/api/research")
      .set("Authorization", "Bearer valid-token")
      .expect(200);

    expect(verifyFirebaseIdToken).toHaveBeenCalledWith("valid-token");
    expect(response.body.items).toHaveLength(2);
    expect(response.body.items[0].title).toBe("Second");
    expect(response.body.items[1].title).toBe("First");
    expect(response.body.items[0].status).toBe("refining");
    expect(response.body.items[0]).not.toHaveProperty("createdAt", undefined);
    expect(response.headers[AUTH_HEADER_UID]).toBeUndefined();
  });

  it("rejects invalid create payloads", async () => {
    verifyFirebaseIdToken.mockResolvedValue({
      uid: "test-user",
      email: "user@example.com"
    });
    startSession.mockResolvedValue({
      sessionId: "session-123",
      questions: [],
      raw: {}
    });
    const app = createApp();

    const response = await request(app)
      .post("/api/research")
      .set("Authorization", "Bearer valid-token")
      .send({ title: "" })
      .expect(400);

    expect(response.body.error).toBe("Invalid request");
  });

  it("returns 502 when OpenAI Deep Research session fails", async () => {
    verifyFirebaseIdToken.mockResolvedValue({
      uid: "test-user",
      email: "user@example.com"
    });
    startSession.mockRejectedValue(new Error("upstream error"));
    const app = createApp();

    const response = await request(app)
      .post("/api/research")
      .set("Authorization", "Bearer valid-token")
      .send({ title: "Fails" })
      .expect(502);

    expect(response.body).toEqual({
      error: "Failed to start OpenAI Deep Research session"
    });
  });

  it("returns a research document for the owner", async () => {
    verifyFirebaseIdToken.mockResolvedValue({
      uid: "test-user",
      email: "user@example.com"
    });
    startSession.mockResolvedValue({
      sessionId: "session-123",
      questions: [{ index: 1, text: "First question?" }],
      raw: {}
    });

    const app = createApp();

    const creation = await request(app)
      .post("/api/research")
      .set("Authorization", "Bearer valid-token")
      .send({ title: "Topic" })
      .expect(201);

    const researchId: string = creation.body.item.id;

    const response = await request(app)
      .get(`/api/research/${researchId}`)
      .set("Authorization", "Bearer valid-token")
      .expect(200);

    expect(response.body.item.id).toBe(researchId);
    expect(response.body.item.dr.sessionId).toBe("session-123");
    expect(response.body.item.dr.questions).toHaveLength(1);
  });

  it("returns 404 when research is missing", async () => {
    verifyFirebaseIdToken.mockResolvedValue({
      uid: "test-user",
      email: "user@example.com"
    });
    const app = createApp();

    await request(app)
      .get("/api/research/missing-id")
      .set("Authorization", "Bearer valid-token")
      .expect(404);
  });

  it("returns 403 when accessing another user's research", async () => {
    verifyFirebaseIdToken.mockResolvedValue({
      uid: "other-user",
      email: "other@example.com"
    });

    const created = await repository.create({ ownerUid: "owner-123", title: "Private" });

    const app = createApp();

    await request(app)
      .get(`/api/research/${created.id}`)
      .set("Authorization", "Bearer valid-token")
      .expect(403);
  });

  it("stores an answer and appends the next question", async () => {
    verifyFirebaseIdToken.mockResolvedValue({
      uid: "test-user",
      email: "user@example.com"
    });
    submitAnswer.mockResolvedValue({
      nextQuestion: { index: 2, text: "Follow-up?" },
      finalPrompt: null,
      raw: {}
    });

    const research = await repository.create({
      ownerUid: "test-user",
      title: "Topic",
      status: "refining",
      dr: {
        sessionId: "session-123",
        questions: [{ index: 1, text: "First question?" }],
        answers: []
      }
    });

    const app = createApp();

    const response = await request(app)
      .post(`/api/research/${research.id}/openai/answer`)
      .set("Authorization", "Bearer valid-token")
      .send({ answer: "First answer", questionIndex: 1 })
      .expect(200);

    expect(submitAnswer).toHaveBeenCalledWith({
      sessionId: "session-123",
      answer: "First answer"
    });

    expect(response.body.nextQuestion).toEqual({ index: 2, text: "Follow-up?" });
    expect(response.body.finalPrompt).toBeNull();
    expect(response.body.item.dr.answers).toEqual([{ index: 1, answer: "First answer" }]);
    expect(response.body.item.dr.questions).toEqual([
      { index: 1, text: "First question?" },
      { index: 2, text: "Follow-up?" }
    ]);

    const stored = await repository.getById(research.id);
    expect(stored?.dr.answers).toEqual([{ index: 1, answer: "First answer" }]);
    expect(stored?.dr.questions).toHaveLength(2);
    expect(stored?.status).toBe("refining");
  });

  it("records the final prompt and transitions status to ready_to_run", async () => {
    verifyFirebaseIdToken.mockResolvedValue({
      uid: "test-user",
      email: "user@example.com"
    });
    submitAnswer.mockResolvedValue({
      nextQuestion: null,
      finalPrompt: "Deep dive on sustainable energy adoption barriers",
      raw: {}
    });

    const research = await repository.create({
      ownerUid: "test-user",
      title: "Topic",
      status: "refining",
      dr: {
        sessionId: "session-abc",
        questions: [{ index: 1, text: "Primary question?" }],
        answers: [{ index: 1, answer: "First answer" }]
      }
    });

    const app = createApp();

    const response = await request(app)
      .post(`/api/research/${research.id}/openai/answer`)
      .set("Authorization", "Bearer valid-token")
      .send({ answer: "Final clarification", questionIndex: 1 })
      .expect(200);

    expect(submitAnswer).toHaveBeenCalledWith({
      sessionId: "session-abc",
      answer: "Final clarification"
    });

    expect(response.body.finalPrompt).toBe(
      "Deep dive on sustainable energy adoption barriers"
    );
    expect(response.body.item.status).toBe("ready_to_run");

    const stored = await repository.getById(research.id);
    expect(stored?.dr.finalPrompt).toBe(
      "Deep dive on sustainable energy adoption barriers"
    );
    expect(stored?.status).toBe("ready_to_run");
  });
});

describe.skip("API /api/research", () => {
  it("should create a research document and start OpenAI session", async () => {
    // TODO: Implement integration test with Next.js API route + Firestore emulator.
  });
});
