import { describe, expect, it, beforeEach } from "vitest";
import {
  FirestoreResearchRepository,
  InvalidPaginationCursorError,
  InvalidResearchStateError
} from "@/server/repositories/researchRepository";
import type { Research } from "@/types/research";
import { Timestamp, type CollectionReference, type WhereFilterOp } from "firebase-admin/firestore";

class FakeDocumentSnapshot {
  constructor(
    public readonly id: string,
    private readonly value: Research | undefined
  ) {}

  get exists() {
    return Boolean(this.value);
  }

  data() {
    return this.value;
  }
}

class FakeDocumentReference {
  constructor(
    private readonly store: Map<string, Research>,
    public readonly id: string
  ) {}

  async set(data: Research) {
    this.store.set(this.id, data);
  }

  async get() {
    return new FakeDocumentSnapshot(this.id, this.store.get(this.id));
  }
}

class FakeQueryDocumentSnapshot {
  constructor(private readonly value: Research) {}

  get id() {
    return this.value.id;
  }

  data() {
    return this.value;
  }
}

class FakeQuerySnapshot {
  constructor(private readonly values: Research[]) {}

  get docs() {
    return this.values.map((value) => new FakeQueryDocumentSnapshot(value));
  }
}

class FakeQuery {
  constructor(private readonly values: Research[]) {}

  orderBy(field: "createdAt" | "id", direction: "asc" | "desc") {
    const sorted = [...this.values].sort((a, b) => {
      let comparison = 0;
      if (field === "createdAt") {
        comparison = a.createdAt.toMillis() - b.createdAt.toMillis();
      } else {
        comparison = a.id.localeCompare(b.id);
      }

      return direction === "desc" ? -comparison : comparison;
    });

    return new FakeQuery(sorted);
  }

  limit(count: number) {
    return new FakeQuery(this.values.slice(0, count));
  }

  startAfter(createdAt: Timestamp, id: string) {
    const targetMillis = createdAt.toMillis();
    const index = this.values.findIndex(
      (item) => item.createdAt.toMillis() === targetMillis && item.id === id
    );
    if (index === -1) {
      return new FakeQuery([]);
    }

    return new FakeQuery(this.values.slice(index + 1));
  }

  async get() {
    return new FakeQuerySnapshot(this.values);
  }
}

class FakeResearchCollection {
  private readonly store = new Map<string, Research>();
  private counter = 0;

  doc(id?: string) {
    const docId = id ?? `fake-${++this.counter}`;
    return new FakeDocumentReference(this.store, docId);
  }

  where(field: string, op: WhereFilterOp, value: unknown) {
    if (field !== "ownerUid" || op !== "==") {
      throw new Error("Unsupported query in fake collection");
    }

    const filtered = [...this.store.values()].filter((item) => item.ownerUid === value);
    return new FakeQuery(filtered);
  }

  setInitial(data: Research) {
    this.store.set(data.id, data);
  }

  snapshot(id: string) {
    return this.store.get(id);
  }
}

describe("FirestoreResearchRepository", () => {
  let collection: FakeResearchCollection;
  let repository: FirestoreResearchRepository;
  let currentTime: number;

  function nextTimestamp() {
    currentTime += 1_000;
    return Timestamp.fromMillis(currentTime);
  }

  beforeEach(() => {
    collection = new FakeResearchCollection();
    currentTime = 1_700_000_000_000;
    repository = new FirestoreResearchRepository({
      // Cast because our fake mimics the Firestore API surface the repository touches.
      collection: collection as unknown as CollectionReference<Research>,
      now: nextTimestamp
    });
  });

  it("creates a research record with defaults and trimmed title", async () => {
    const created = await repository.create({ ownerUid: "user-1", title: "  AI safety  " });

    expect(created.title).toBe("AI safety");
    expect(created.status).toBe("awaiting_refinements");
    expect(created.dr.questions).toEqual([]);
    expect(created.gemini.answers).toEqual([]);
    expect(created.createdAt.toMillis()).toBeGreaterThan(0);

    const stored = collection.snapshot(created.id);
    expect(stored).toBeDefined();
    expect(stored?.createdAt.toMillis()).toBe(created.createdAt.toMillis());
  });

  it("prevents invalid status transitions", async () => {
    const created = await repository.create({ ownerUid: "user-1", title: "Topic" });

    await expect(
      repository.update(created.id, { status: "completed" })
    ).rejects.toBeInstanceOf(InvalidResearchStateError);
  });

  it("allows valid status transitions", async () => {
    const created = await repository.create({ ownerUid: "user-1", title: "Topic" });

    const updated = await repository.update(created.id, { status: "refining" });
    expect(updated.status).toBe("refining");
    expect(updated.updatedAt.toMillis()).toBeGreaterThan(created.updatedAt.toMillis());
  });

  it("paginates research by owner", async () => {
    const first = await repository.create({ ownerUid: "user-1", title: "First" });
    const second = await repository.create({ ownerUid: "user-1", title: "Second" });
    await repository.create({ ownerUid: "user-2", title: "Other" });

    const pageOne = await repository.listByOwner("user-1", { limit: 1 });
    expect(pageOne.items).toHaveLength(1);
    expect(pageOne.items[0].id).toBe(second.id);
    expect(pageOne.nextCursor).toBeTruthy();

    const pageTwo = await repository.listByOwner("user-1", { cursor: pageOne.nextCursor ?? undefined });
    expect(pageTwo.items).toHaveLength(1);
    expect(pageTwo.items[0].id).toBe(first.id);
    expect(pageTwo.nextCursor).toBeNull();
  });

  it("rejects malformed cursors", async () => {
    await repository.create({ ownerUid: "user-1", title: "Topic" });

    await expect(
      repository.listByOwner("user-1", { cursor: "not-base64" })
    ).rejects.toBeInstanceOf(InvalidPaginationCursorError);
  });
});
