import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendResearchReportEmail } from "@/server/email/sendResearchReport";
import {
  getResearchRepository,
  setResearchRepository,
  type CreateResearchInput,
  type ResearchRepository,
  type UpdateResearchInput
} from "@/server/repositories/researchRepository";
import {
  getUserRepository,
  setUserRepository,
  type UserRepository
} from "@/server/repositories/userRepository";
import type { Research, ResearchProviderState, UserProfile } from "@/types/research";
import { Timestamp } from "firebase-admin/firestore";

const TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 11).toString("base64");

const mockEnv = vi.hoisted(() => ({
  getServerEnv: vi.fn()
}));

const mockEmail = vi.hoisted(() => ({
  sendWithGmail: vi.fn(),
  sendWithSendgrid: vi.fn()
}));

vi.mock("@/config/env", () => ({
  getServerEnv: mockEnv.getServerEnv
}));

vi.mock("@/lib/email", () => ({
  sendWithGmail: mockEmail.sendWithGmail,
  sendWithSendgrid: mockEmail.sendWithSendgrid
}));

class TestResearchRepository implements ResearchRepository {
  private store: Map<string, Research> = new Map();
  private currentTime = 1_700_000_000_000;
  private counter = 0;

  private nextTimestamp() {
    this.currentTime += 1_000;
    return Timestamp.fromMillis(this.currentTime);
  }

  private cloneProvider(state?: ResearchProviderState): ResearchProviderState {
    if (!state) {
      return { questions: [], answers: [] };
    }
    return {
      ...state,
      questions: [...(state.questions ?? [])],
      answers: [...(state.answers ?? [])]
    };
  }

  async create(input: CreateResearchInput): Promise<Research> {
    const id = `research-${++this.counter}`;
    const now = this.nextTimestamp();
    const research: Research = {
      id,
      ownerUid: input.ownerUid,
      title: input.title,
      status: input.status ?? "completed",
      dr: this.cloneProvider(input.dr),
      gemini: this.cloneProvider(input.gemini),
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
    const research = this.store.get(id);
    if (!research) {
      throw new Error("Research not found");
    }
    if (options?.ownerUid && options.ownerUid !== research.ownerUid) {
      throw new Error("Forbidden");
    }

    const next: Research = {
      ...research,
      status: update.status ?? research.status,
      title: update.title ?? research.title,
      dr: {
        ...this.cloneProvider(research.dr),
        ...(update.dr ?? {})
      },
      gemini: {
        ...this.cloneProvider(research.gemini),
        ...(update.gemini ?? {})
      },
      report: {
        ...research.report,
        ...(update.report ?? {})
      },
      updatedAt: this.nextTimestamp()
    };

    this.store.set(id, next);
    return next;
  }

  async getById(id: string): Promise<Research | null> {
    return this.store.get(id) ?? null;
  }

  async listByOwner() {
    return { items: [], nextCursor: null };
  }
}

class TestUserRepository implements UserRepository {
  private store = new Map<string, UserProfile>();
  private currentTime = 1_700_100_000_000;

  private nextTimestamp() {
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
        throw new Error("Profile required");
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

describe("sendResearchReportEmail", () => {
  let researchRepository: TestResearchRepository;
  let userRepository: TestUserRepository;
  let research: Research;

  beforeEach(async () => {
    mockEnv.getServerEnv.mockReturnValue({
      FIREBASE_PROJECT_ID: "test",
      FIREBASE_CLIENT_EMAIL: "service@test.com",
      FIREBASE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
      FIREBASE_STORAGE_BUCKET: undefined,
      OPENAI_API_KEY: "openai",
      OPENAI_DR_BASE_URL: "https://openai.test",
      GEMINI_API_KEY: "gemini",
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

    researchRepository = new TestResearchRepository();
    userRepository = new TestUserRepository();
    setResearchRepository(researchRepository);
    setUserRepository(userRepository);

    research = await researchRepository.create({
      ownerUid: "user-1",
      title: "Report Delivery Test",
      status: "completed",
      dr: { status: "success" },
      gemini: { status: "success" },
      report: {}
    });

    await userRepository.upsertGmailTokens(
      "user-1",
      {
        access_token: "gma1:encrypted-access",
        refresh_token: "gma1:encrypted-refresh"
      },
      {
        email: "owner@example.com",
        displayName: "Owner"
      }
    );

    mockEmail.sendWithGmail.mockReset();
    mockEmail.sendWithSendgrid.mockReset();
  });

  afterEach(() => {
    setResearchRepository(null);
    setUserRepository(null);
  });

  it("falls back to SendGrid when Gmail fails with invalid credentials", async () => {
    mockEmail.sendWithGmail.mockResolvedValue({
      ok: false,
      reason: "Invalid refresh token",
      shouldInvalidateCredentials: true
    });

    mockEmail.sendWithSendgrid.mockResolvedValue({
      ok: true,
      messageId: "sendgrid-321"
    });

    const pdfBuffer = Buffer.from("%PDF-1.4 test");

    const result = await sendResearchReportEmail({
      researchId: research.id,
      ownerUid: "user-1",
      to: "owner@example.com",
      title: research.title,
      filename: "report.pdf",
      pdfBuffer
    });

    expect(mockEmail.sendWithGmail).toHaveBeenCalledTimes(1);
    expect(mockEmail.sendWithSendgrid).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("sent");
    expect(result.provider).toBe("sendgrid");
    expect(result.messageId).toBe("sendgrid-321");

    const updatedResearch = await getResearchRepository().getById(research.id);
    expect(updatedResearch?.report.emailStatus).toBe("sent");
    expect(updatedResearch?.report.emailedTo).toBe("owner@example.com");
    expect(updatedResearch?.report.emailError).toBeNull();

    const user = await getUserRepository().getById("user-1");
    expect(user?.gmail_oauth).toBeUndefined();
  });
});
