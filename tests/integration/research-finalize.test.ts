import express from "express";
import request from "supertest";
import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { middleware } from "../../middleware";
import { POST as POST_FINALIZE } from "../../app/api/research/[id]/finalize/route";
import {
  setResearchRepository,
  type CreateResearchInput,
  type PaginatedResearchResult,
  type ResearchRepository,
  type UpdateResearchInput
} from "@/server/repositories/researchRepository";
import type { Research, ResearchProviderState } from "@/types/research";
import {
  SAMPLE_GEMINI_RESULT,
  SAMPLE_OPENAI_RESULT
} from "@/tests/fixtures/researchReport";
import { Timestamp } from "firebase-admin/firestore";

const mockTokenVerifier = vi.hoisted(() => ({
  verifyFirebaseIdToken: vi.fn()
}));

const mockPdfStorage = vi.hoisted(() => ({
  persistResearchPdf: vi.fn()
}));

const verifyFirebaseIdToken = mockTokenVerifier.verifyFirebaseIdToken;
const persistResearchPdf = mockPdfStorage.persistResearchPdf;

vi.mock("@/lib/firebase/tokenVerifier", () => mockTokenVerifier);
vi.mock("@/lib/pdf/storage", () => mockPdfStorage);

function cloneProviderState(state?: ResearchProviderState): ResearchProviderState {
  if (!state) {
    return {
      questions: [],
      answers: [],
      status: "idle"
    };
  }

  return {
    ...state,
    questions: [...(state.questions ?? [])],
    answers: [...(state.answers ?? [])]
  };
}

class InMemoryResearchRepository implements ResearchRepository {
  private store: Map<string, Research> = new Map();
  private counter = 0;
  private currentTime = 1_700_000_000_000;

  private nextTimestamp(): Timestamp {
    this.currentTime += 1_000;
    return Timestamp.fromMillis(this.currentTime);
  }

  async create(input: CreateResearchInput): Promise<Research> {
    const id = `research-${++this.counter}`;
    const now = this.nextTimestamp();
    const research: Research = {
      id,
      ownerUid: input.ownerUid,
      title: input.title.trim(),
      status: input.status ?? "awaiting_refinements",
      dr: cloneProviderState(input.dr),
      gemini: cloneProviderState(input.gemini),
      report: input.report ?? {},
      createdAt: now,
      updatedAt: now
    };

    this.store.set(id, research);
    return research;
  }

  async update(
    id: string,
    update: UpdateResearchInput,
    options?: { ownerUid?: string }
  ): Promise<Research> {
    const current = this.store.get(id);
    if (!current) {
      throw new Error(`Research ${id} not found`);
    }

    if (options?.ownerUid && current.ownerUid !== options.ownerUid) {
      throw new Error("Forbidden");
    }

    const next: Research = {
      ...current,
      title: update.title?.trim() ? update.title.trim() : current.title,
      status: update.status ?? current.status,
      dr: cloneProviderState({
        ...current.dr,
        ...(update.dr ?? {})
      }),
      gemini: cloneProviderState({
        ...current.gemini,
        ...(update.gemini ?? {})
      }),
      report: {
        ...current.report,
        ...(update.report ?? {})
      },
      updatedAt: this.nextTimestamp()
    };

    this.store.set(id, next);
    return next;
  }

  async getById(id: string, options?: { ownerUid?: string }): Promise<Research | null> {
    const research = this.store.get(id) ?? null;
    if (!research) {
      return null;
    }

    if (options?.ownerUid && research.ownerUid !== options.ownerUid) {
      throw new Error("Forbidden");
    }

    return research;
  }

  async listByOwner(): Promise<PaginatedResearchResult> {
    return {
      items: [],
      nextCursor: null
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

  const buffer = Buffer.from(await nextResponse.arrayBuffer());
  res.status(nextResponse.status).send(buffer);
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
      const overrides = JSON.parse(Buffer.from(encodedHeaders, "base64").toString("utf8")) as Record<
        string,
        string
      >;
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

  app.post("/api/research/:id/finalize", async (req, res) => {
    const url = new URL(req.originalUrl || req.url, `http://${req.headers.host ?? "localhost"}`);
    const nextReq = new NextRequest(url, {
      method: "POST",
      headers: headersFromNode(req.headers as Record<string, string | string[]>)
    });

    const response = await POST_FINALIZE(nextReq, { params: { id: req.params.id } });
    await applyNextResponse(res, response);
  });

  return app;
}

function binaryParser(res: any, callback: (err: Error | null, body?: Buffer) => void) {
  const data: Uint8Array[] = [];
  res.on("data", (chunk: Uint8Array) => data.push(chunk));
  res.on("end", () => {
    callback(null, Buffer.concat(data));
  });
  res.on("error", (error: Error) => callback(error));
}

describe("POST /api/research/:id/finalize", () => {
  let repository: InMemoryResearchRepository;

  beforeEach(() => {
    repository = new InMemoryResearchRepository();
    setResearchRepository(repository);
    verifyFirebaseIdToken.mockReset();
    persistResearchPdf.mockReset();
  });

  afterEach(() => {
    setResearchRepository(null);
  });

  it("returns a PDF response and records the storage path", async () => {
    verifyFirebaseIdToken.mockResolvedValue({
      uid: "user-123",
      email: "owner@example.com"
    });

    persistResearchPdf.mockResolvedValue({
      status: "uploaded",
      bucket: "test-bucket",
      path: "reports/research-1/report.pdf",
      storageUri: "gs://test-bucket/reports/research-1/report.pdf"
    });

    const seeded = await repository.create({
      ownerUid: "user-123",
      title: "Finalize Integration Test",
      status: "completed",
      dr: {
        status: "success",
        result: SAMPLE_OPENAI_RESULT
      },
      gemini: {
        status: "success",
        result: SAMPLE_GEMINI_RESULT
      },
      report: {}
    });

    const app = createApp();

    const response = await request(app)
      .post(`/api/research/${seeded.id}/finalize`)
      .set("Authorization", "Bearer integration-token")
      .buffer(true)
      .parse(binaryParser)
      .expect(200);

    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["x-storage-status"]).toBe("uploaded");
    expect(response.headers["x-report-pdf-path"]).toBe("reports/research-1/report.pdf");

    const body: Buffer = response.body;
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(body.toString("ascii", 0, 4)).toBe("%PDF");
    expect(body.length).toBeGreaterThan(800);

    expect(persistResearchPdf).toHaveBeenCalledTimes(1);
    expect(persistResearchPdf.mock.calls[0][0]).toMatchObject({
      researchId: seeded.id,
      filename: "finalize-integration-test.pdf"
    });

    const updated = await repository.getById(seeded.id, { ownerUid: "user-123" });
    expect(updated?.report.pdfPath).toBe("reports/research-1/report.pdf");
  });
});
