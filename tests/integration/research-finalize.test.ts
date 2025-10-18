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
import {
  setUserRepository,
  type UserRepository
} from "@/server/repositories/userRepository";
import type { Research, ResearchProviderState, UserProfile } from "@/types/research";
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

const TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");

const mockEnv = vi.hoisted(() => ({
  getServerEnv: vi.fn()
}));

const mockEmail = vi.hoisted(() => ({
  sendWithGmail: vi.fn(),
  sendWithSendgrid: vi.fn()
}));

const verifyFirebaseIdToken = mockTokenVerifier.verifyFirebaseIdToken;
const persistResearchPdf = mockPdfStorage.persistResearchPdf;

vi.mock("@/lib/firebase/tokenVerifier", () => mockTokenVerifier);
vi.mock("@/lib/pdf/storage", () => mockPdfStorage);
vi.mock("@/config/env", () => ({
  getServerEnv: mockEnv.getServerEnv,
  getPublicEnv: () => ({}),
  getEnv: () => ({
    ...(mockEnv.getServerEnv() as Record<string, unknown>),
    NEXT_PUBLIC_FIREBASE_API_KEY: "test",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "example.firebaseapp.com",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "test",
    NEXT_PUBLIC_FIREBASE_APP_ID: "app"
  }),
  resetEnvCache: () => {}
}));
vi.mock("@/lib/email", () => ({
  sendWithGmail: mockEmail.sendWithGmail,
  sendWithSendgrid: mockEmail.sendWithSendgrid
}));

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

class InMemoryUserRepository implements UserRepository {
  private store: Map<string, UserProfile> = new Map();
  private currentTime = 1_700_500_000_000;

  private nextTimestamp(): Timestamp {
    this.currentTime += 1_000;
    return Timestamp.fromMillis(this.currentTime);
  }

  async getById(uid: string): Promise<UserProfile | null> {
    return this.store.get(uid) ?? null;
  }

  async upsertGmailTokens(
    uid: string,
    tokens: UserProfile["gmail_oauth"] | null,
    profile?: { email: string; displayName: string; photoURL?: string }
  ): Promise<UserProfile> {
    const existing = this.store.get(uid);
    const now = this.nextTimestamp();

    if (!existing) {
      if (!profile) {
        throw new Error("Profile details are required to create a user document");
      }

      const created: UserProfile = {
        uid,
        email: profile.email,
        displayName: profile.displayName,
        photoURL: profile.photoURL,
        gmail_oauth: tokens ?? undefined,
        createdAt: now,
        updatedAt: now
      };

      this.store.set(uid, created);
      return created;
    }

    const next: UserProfile = {
      ...existing,
      email: profile?.email ?? existing.email,
      displayName: profile?.displayName ?? existing.displayName,
      photoURL: profile?.photoURL ?? existing.photoURL,
      gmail_oauth: tokens ?? undefined,
      updatedAt: now
    };

    this.store.set(uid, next);
    return next;
  }

  async updateProfile(
    uid: string,
    update: { email?: string; displayName?: string; photoURL?: string | null }
  ): Promise<UserProfile> {
    const existing = this.store.get(uid);
    if (!existing) {
      throw new Error("User not found");
    }

    const now = this.nextTimestamp();
    const next: UserProfile = {
      ...existing,
      email: update.email ?? existing.email,
      displayName: update.displayName ?? existing.displayName,
      photoURL:
        update.photoURL === null ? undefined : update.photoURL ?? existing.photoURL,
      updatedAt: now
    };

    this.store.set(uid, next);
    return next;
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
  let userRepository: InMemoryUserRepository;

  beforeEach(() => {
    repository = new InMemoryResearchRepository();
    setResearchRepository(repository);
    userRepository = new InMemoryUserRepository();
    setUserRepository(userRepository);
    verifyFirebaseIdToken.mockReset();
    persistResearchPdf.mockReset();
    mockEmail.sendWithGmail.mockReset();
    mockEmail.sendWithSendgrid.mockReset();
    mockEnv.getServerEnv.mockReset();
    mockEnv.getServerEnv.mockReturnValue({
      FIREBASE_PROJECT_ID: "test-project",
      FIREBASE_CLIENT_EMAIL: "service@test.com",
      FIREBASE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
      FIREBASE_STORAGE_BUCKET: "test-bucket",
      OPENAI_API_KEY: "test-openai",
      OPENAI_DR_BASE_URL: "https://openai.test",
      GEMINI_API_KEY: "test-gemini",
      GEMINI_BASE_URL: "https://gemini.test",
      GEMINI_MODEL: "models/test",
      GOOGLE_OAUTH_CLIENT_ID: "oauth-client",
      GOOGLE_OAUTH_CLIENT_SECRET: "oauth-secret",
      GOOGLE_OAUTH_REDIRECT_URI: "https://example.com/oauth",
      GOOGLE_OAUTH_SCOPES: "scope",
      TOKEN_ENCRYPTION_KEY,
      SENDGRID_API_KEY: "sendgrid",
      FROM_EMAIL: "reports@example.com",
      APP_BASE_URL: "https://app.example.com"
    });
  });

  afterEach(() => {
    setResearchRepository(null);
    setUserRepository(null);
  });

  it("sends the report via Gmail and returns the PDF response", async () => {
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

    await userRepository.upsertGmailTokens(
      "user-123",
      {
        access_token: "old-access",
        refresh_token: "old-refresh",
        expiry_date: Date.now() + 5 * 60_000
      },
      {
        email: "owner@example.com",
        displayName: "Owner Example"
      }
    );

    mockEmail.sendWithGmail.mockResolvedValue({
      ok: true,
      messageId: "gmail-123",
      tokens: {
        access_token: "new-access",
        refresh_token: "new-refresh",
        expiry_date: Date.now() + 3_600_000,
        scope: "gmail.send"
      }
    });

    mockEmail.sendWithSendgrid.mockResolvedValue({
      ok: true,
      messageId: "sendgrid-ignored"
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

    expect(mockEmail.sendWithGmail).toHaveBeenCalledTimes(1);
    expect(mockEmail.sendWithSendgrid).not.toHaveBeenCalled();

    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["x-storage-status"]).toBe("uploaded");
    expect(response.headers["x-report-pdf-path"]).toBe("reports/research-1/report.pdf");
    expect(response.headers["x-email-status"]).toBe("sent");
    expect(response.headers["x-email-provider"]).toBe("gmail");
    expect(response.headers["x-email-message-id"]).toBe("gmail-123");
    expect(response.headers["x-email-error"]).toBeUndefined();

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
    expect(updated?.report.emailStatus).toBe("sent");
    expect(updated?.report.emailedTo).toBe("owner@example.com");
    expect(updated?.report.emailError).toBeNull();

    const storedUser = await userRepository.getById("user-123");
    expect(storedUser?.gmail_oauth?.access_token).toMatch(/^gma1:/);
    expect(storedUser?.gmail_oauth?.refresh_token).toMatch(/^gma1:/);
  });

  it("falls back to SendGrid when Gmail delivery fails", async () => {
    verifyFirebaseIdToken.mockResolvedValue({
      uid: "user-123",
      email: "owner@example.com"
    });

    persistResearchPdf.mockResolvedValue({
      status: "uploaded",
      bucket: "test-bucket",
      path: "reports/research-2/report.pdf",
      storageUri: "gs://test-bucket/reports/research-2/report.pdf"
    });

    await userRepository.upsertGmailTokens(
      "user-123",
      {
        access_token: "existing-access",
        refresh_token: "existing-refresh",
        expiry_date: Date.now() - 5_000
      },
      {
        email: "owner@example.com",
        displayName: "Owner Example"
      }
    );

    mockEmail.sendWithGmail.mockResolvedValue({
      ok: false,
      reason: "Access token refresh failed",
      tokens: {
        access_token: "refreshed-access",
        refresh_token: "existing-refresh"
      },
      shouldInvalidateCredentials: false
    });

    mockEmail.sendWithSendgrid.mockResolvedValue({
      ok: true,
      messageId: "sendgrid-123"
    });

    const seeded = await repository.create({
      ownerUid: "user-123",
      title: "Finalize Fallback Test",
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

    expect(mockEmail.sendWithGmail).toHaveBeenCalledTimes(2);
    expect(mockEmail.sendWithSendgrid).toHaveBeenCalledTimes(1);

    expect(response.headers["x-email-status"]).toBe("sent");
    expect(response.headers["x-email-provider"]).toBe("sendgrid");
    expect(response.headers["x-email-message-id"]).toBe("sendgrid-123");

    const updated = await repository.getById(seeded.id, { ownerUid: "user-123" });
    expect(updated?.report.emailStatus).toBe("sent");
    expect(updated?.report.emailedTo).toBe("owner@example.com");
    expect(updated?.report.emailError).toBeNull();

    const storedUser = await userRepository.getById("user-123");
    expect(storedUser?.gmail_oauth?.access_token).toMatch(/^gma1:/);
    expect(storedUser?.gmail_oauth?.refresh_token).toMatch(/^gma1:/);
  });

  it("reports failure when both Gmail and SendGrid delivery fail", async () => {
    verifyFirebaseIdToken.mockResolvedValue({
      uid: "user-123",
      email: "owner@example.com"
    });

    persistResearchPdf.mockResolvedValue({
      status: "uploaded",
      bucket: "test-bucket",
      path: "reports/research-3/report.pdf",
      storageUri: "gs://test-bucket/reports/research-3/report.pdf"
    });

    await userRepository.upsertGmailTokens(
      "user-123",
      {
        access_token: "existing-access",
        refresh_token: "existing-refresh"
      },
      {
        email: "owner@example.com",
        displayName: "Owner Example"
      }
    );

    mockEmail.sendWithGmail.mockResolvedValue({
      ok: false,
      reason: "Invalid refresh token",
      shouldInvalidateCredentials: true
    });

    mockEmail.sendWithSendgrid.mockResolvedValue({
      ok: false,
      reason: "SendGrid unavailable"
    });

    const seeded = await repository.create({
      ownerUid: "user-123",
      title: "Finalize Failure Test",
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

    expect(mockEmail.sendWithGmail).toHaveBeenCalledTimes(1);
    expect(mockEmail.sendWithSendgrid).toHaveBeenCalledTimes(1);

    expect(response.headers["x-email-status"]).toBe("failed");
    expect(response.headers["x-email-provider"]).toBe("sendgrid");
    expect(response.headers["x-email-error"]).toContain("Invalid refresh token");
    expect(response.headers["x-email-error"]).toContain("SendGrid unavailable");

    const updated = await repository.getById(seeded.id, { ownerUid: "user-123" });
    expect(updated?.report.emailStatus).toBe("failed");
    expect(updated?.report.emailError).toContain("Invalid refresh token");
    expect(updated?.report.emailError).toContain("SendGrid unavailable");

    const storedUser = await userRepository.getById("user-123");
    expect(storedUser?.gmail_oauth).toBeUndefined();
  });
});
