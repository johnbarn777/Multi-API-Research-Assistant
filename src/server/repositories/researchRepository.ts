import { adminDb } from "@/lib/firebase/admin";
import { ForbiddenError } from "@/server/auth/session";
import type {
  Research,
  ResearchProviderState,
  ResearchReportState,
  ResearchStatus
} from "@/types/research";
import {
  Timestamp,
  type CollectionReference,
  type FirestoreDataConverter,
  type Query,
  type QueryDocumentSnapshot
} from "firebase-admin/firestore";

export interface CreateResearchInput {
  ownerUid: string;
  title: string;
  status?: ResearchStatus;
  dr?: ResearchProviderState;
  gemini?: ResearchProviderState;
  report?: ResearchReportState;
}

export interface UpdateResearchInput {
  title?: string;
  status?: ResearchStatus;
  dr?: ResearchProviderState;
  gemini?: ResearchProviderState;
  report?: ResearchReportState;
}

export interface ListResearchOptions {
  limit?: number;
  cursor?: string | null;
}

export interface PaginatedResearchResult {
  items: Research[];
  nextCursor: string | null;
}

export interface ResearchRepository {
  create(input: CreateResearchInput): Promise<Research>;
  update(
    id: string,
    update: UpdateResearchInput,
    options?: { ownerUid?: string }
  ): Promise<Research>;
  getById(id: string, options?: { ownerUid?: string }): Promise<Research | null>;
  listByOwner(ownerUid: string, options?: ListResearchOptions): Promise<PaginatedResearchResult>;
}

export class ResearchNotFoundError extends Error {
  public readonly statusCode = 404;

  constructor(id: string) {
    super(`Research ${id} was not found`);
    this.name = "ResearchNotFoundError";
  }
}

export class InvalidResearchStateError extends Error {
  public readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "InvalidResearchStateError";
  }
}

export class InvalidPaginationCursorError extends Error {
  public readonly statusCode = 400;

  constructor() {
    super("Invalid pagination cursor");
    this.name = "InvalidPaginationCursorError";
  }
}

const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 20;

const allowedTransitions: Record<ResearchStatus, ReadonlySet<ResearchStatus>> = {
  awaiting_refinements: new Set(["refining", "ready_to_run", "failed"]),
  refining: new Set(["ready_to_run", "failed"]),
  ready_to_run: new Set(["running", "failed"]),
  running: new Set(["completed", "failed"]),
  completed: new Set(),
  failed: new Set()
};

const researchConverter: FirestoreDataConverter<Research> = {
  toFirestore(research: Research) {
    return research;
  },
  fromFirestore(snapshot: QueryDocumentSnapshot<Research>) {
    const data = snapshot.data();
    return {
      ...data,
      id: data.id ?? snapshot.id
    };
  }
};

function mergeProviderState(
  current: ResearchProviderState | undefined,
  patch?: ResearchProviderState
): ResearchProviderState {
  const currentQuestions = Array.isArray(current?.questions) ? current?.questions : [];
  const currentAnswers = Array.isArray(current?.answers) ? current?.answers : [];

  const normalizedCurrent: ResearchProviderState = {
    status: current?.status ?? "idle",
    error: current?.error ?? null,
    questions: [...currentQuestions],
    answers: [...currentAnswers]
  };

  if (typeof current?.sessionId === "string" && current.sessionId.trim().length > 0) {
    normalizedCurrent.sessionId = current.sessionId;
  }

  if (typeof current?.jobId === "string" && current.jobId.trim().length > 0) {
    normalizedCurrent.jobId = current.jobId;
  }

  if (
    typeof current?.finalPrompt === "string" &&
    current.finalPrompt.trim().length > 0
  ) {
    normalizedCurrent.finalPrompt = current.finalPrompt;
  }

  if (current?.result !== undefined) {
    normalizedCurrent.result = current.result;
  }

  if (typeof current?.durationMs === "number" && Number.isFinite(current.durationMs)) {
    normalizedCurrent.durationMs = current.durationMs;
  }

  if (typeof current?.startedAt === "string" && current.startedAt.length > 0) {
    normalizedCurrent.startedAt = current.startedAt;
  }

  if (typeof current?.completedAt === "string" && current.completedAt.length > 0) {
    normalizedCurrent.completedAt = current.completedAt;
  }

  if (!patch) {
    return normalizedCurrent;
  }

  const normalizedPatch: Partial<ResearchProviderState> = {};
  const keysToUnset = new Set<keyof ResearchProviderState>();

  (Object.keys(patch) as Array<keyof ResearchProviderState>).forEach((key) => {
    const value = patch[key];

    if (value === undefined) {
      keysToUnset.add(key);
      return;
    }

    (normalizedPatch as Record<keyof ResearchProviderState, unknown>)[key] = value;
  });

  const merged: ResearchProviderState = {
    ...normalizedCurrent,
    ...normalizedPatch,
    questions:
      normalizedPatch.questions !== undefined
        ? normalizedPatch.questions
        : normalizedCurrent.questions,
    answers:
      normalizedPatch.answers !== undefined ? normalizedPatch.answers : normalizedCurrent.answers
  };

  keysToUnset.forEach((key) => {
    delete (merged as Record<keyof ResearchProviderState, unknown>)[key];
  });

  return merged;
}

function sanitizeLimit(limit?: number): number {
  if (!limit || Number.isNaN(limit)) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.min(Math.max(Math.floor(limit), 1), MAX_PAGE_SIZE);
}

function encodeCursor(research: Research): string {
  const payload = JSON.stringify({
    createdAt: research.createdAt.toMillis(),
    id: research.id
  });
  return Buffer.from(payload, "utf8").toString("base64");
}

function decodeCursor(cursor: string): { createdAt: number; id: string } {
  try {
    const decoded = Buffer.from(cursor, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as { createdAt: number; id: string };

    if (typeof parsed.createdAt !== "number" || typeof parsed.id !== "string") {
      throw new Error("Invalid cursor payload");
    }

    return parsed;
  } catch (error) {
    throw new InvalidPaginationCursorError();
  }
}

function assertValidTransition(current: ResearchStatus, next: ResearchStatus) {
  if (current === next) {
    return;
  }

  const allowed = allowedTransitions[current];
  if (!allowed || !allowed.has(next)) {
    throw new InvalidResearchStateError(
      `Cannot transition research from ${current} to ${next}`
    );
  }
}

export class FirestoreResearchRepository implements ResearchRepository {
  private readonly collection: CollectionReference<Research>;
  private readonly now: () => Timestamp;

  constructor(options?: {
    collection?: CollectionReference<Research>;
    now?: () => Timestamp;
  }) {
    this.collection =
      options?.collection ??
      adminDb().collection("research").withConverter(researchConverter);
    this.now = options?.now ?? (() => Timestamp.now());
  }

  async create(input: CreateResearchInput): Promise<Research> {
    const docRef = this.collection.doc();
    const now = this.now();
    const sanitizedTitle = input.title.trim();

    if (!sanitizedTitle) {
      throw new InvalidResearchStateError("Research title is required");
    }

    const research: Research = {
      id: docRef.id,
      ownerUid: input.ownerUid,
      title: sanitizedTitle,
      status: input.status ?? "awaiting_refinements",
      dr: mergeProviderState(
        {
          questions: [],
          answers: [],
          status: "idle"
        },
        input.dr
      ),
      gemini: mergeProviderState(
        {
          questions: [],
          answers: [],
          status: "idle"
        },
        input.gemini
      ),
      report: {
        ...(input.report ?? {})
      },
      createdAt: now,
      updatedAt: now
    };

    await docRef.set(research, { merge: false });
    return research;
  }

  async update(
    id: string,
    update: UpdateResearchInput,
    options?: { ownerUid?: string }
  ): Promise<Research> {
    const docRef = this.collection.doc(id);
    const firestore = (this.collection as CollectionReference<Research> & {
      firestore?: { runTransaction?: typeof docRef.firestore.runTransaction };
    }).firestore;

    const buildNext = (current: Research): Research => {
      if (options?.ownerUid && current.ownerUid !== options.ownerUid) {
        throw new ForbiddenError("You do not have access to this research");
      }

      if (update.status) {
        assertValidTransition(current.status, update.status);
      }

      const now = this.now();

      return {
        ...current,
        title: update.title?.trim() ? update.title.trim() : current.title,
        status: update.status ?? current.status,
        dr: mergeProviderState(current.dr, update.dr),
        gemini: mergeProviderState(current.gemini, update.gemini),
        report: {
          ...current.report,
          ...(update.report ?? {})
        },
        updatedAt: now
      };
    };

    if (!firestore || typeof firestore.runTransaction !== "function") {
      const snapshot = await docRef.get();

      if (!snapshot.exists) {
        throw new ResearchNotFoundError(id);
      }

      const current = snapshot.data()!;
      const next = buildNext(current);
      await docRef.set(next, { merge: false });
      return next;
    }

    return await firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(docRef);

      if (!snapshot.exists) {
        throw new ResearchNotFoundError(id);
      }

      const current = snapshot.data()!;
      const next = buildNext(current);

      transaction.set(docRef, next, { merge: false });
      return next;
    });
  }

  async getById(
    id: string,
    options?: { ownerUid?: string }
  ): Promise<Research | null> {
    const snapshot = await this.collection.doc(id).get();

    if (!snapshot.exists) {
      return null;
    }

    const research = snapshot.data()!;

    if (options?.ownerUid && research.ownerUid !== options.ownerUid) {
      throw new ForbiddenError("You do not have access to this research");
    }

    return research;
  }

  async listByOwner(
    ownerUid: string,
    options?: ListResearchOptions
  ): Promise<PaginatedResearchResult> {
    const limit = sanitizeLimit(options?.limit);
    let query: Query<Research> = this.collection
      .where("ownerUid", "==", ownerUid)
      .orderBy("createdAt", "desc")
      .orderBy("id", "desc")
      .limit(limit + 1);

    if (options?.cursor) {
      const decoded = decodeCursor(options.cursor);
      query = query.startAfter(Timestamp.fromMillis(decoded.createdAt), decoded.id);
    }

    const snapshot = await query.get();
    const docSnapshots = snapshot.docs;

    let nextCursor: string | null = null;
    if (docSnapshots.length > limit) {
      const lastVisible = docSnapshots[limit - 1];
      nextCursor = encodeCursor(lastVisible.data());
      docSnapshots.length = limit;
    }

    const items = docSnapshots.map((doc) => doc.data());
    return { items, nextCursor };
  }
}

let repositoryOverride: ResearchRepository | null = null;
let cachedRepository: ResearchRepository | null = null;

export function setResearchRepository(instance: ResearchRepository | null) {
  repositoryOverride = instance;
}

export function getResearchRepository(): ResearchRepository {
  if (repositoryOverride) {
    return repositoryOverride;
  }

  if (!cachedRepository) {
    cachedRepository = new FirestoreResearchRepository();
  }

  return cachedRepository;
}
