import { beforeEach, describe, expect, it } from "vitest";
import { FirestoreUserRepository } from "@/server/repositories/userRepository";
import type { UserProfile } from "@/types/research";
import { Timestamp, type CollectionReference } from "firebase-admin/firestore";

class FakeUserSnapshot {
  constructor(private readonly value: UserProfile | undefined) {}

  get exists() {
    return Boolean(this.value);
  }

  data() {
    return this.value;
  }
}

class FakeUserDocRef {
  constructor(private readonly store: Map<string, UserProfile>, private readonly id: string) {}

  async set(data: UserProfile) {
    this.store.set(this.id, data);
  }

  async get() {
    return new FakeUserSnapshot(this.store.get(this.id));
  }
}

class FakeUserCollection {
  private readonly store = new Map<string, UserProfile>();

  doc(id: string) {
    return new FakeUserDocRef(this.store, id);
  }

  snapshot(id: string) {
    return this.store.get(id);
  }
}

describe("FirestoreUserRepository", () => {
  let collection: FakeUserCollection;
  let repository: FirestoreUserRepository;
  let currentTime: number;

  function nextTimestamp() {
    currentTime += 1_000;
    return Timestamp.fromMillis(currentTime);
  }

  beforeEach(() => {
    collection = new FakeUserCollection();
    currentTime = 1_700_000_000_000;
    repository = new FirestoreUserRepository({
      collection: collection as unknown as CollectionReference<UserProfile>,
      now: nextTimestamp
    });
  });

  it("creates a user document when saving Gmail tokens for the first time", async () => {
    const profile = await repository.upsertGmailTokens("user-1", { access_token: "abc" }, {
      email: "user@example.com",
      displayName: "Test User"
    });

    expect(profile.gmail_oauth?.access_token).toBe("abc");
    expect(profile.createdAt.toMillis()).toBeGreaterThan(0);

    const stored = collection.snapshot("user-1");
    expect(stored?.email).toBe("user@example.com");
  });

  it("updates tokens on an existing user", async () => {
    await repository.upsertGmailTokens("user-1", { access_token: "old" }, {
      email: "user@example.com",
      displayName: "Test User"
    });

    const updated = await repository.upsertGmailTokens("user-1", { access_token: "new" });

    expect(updated.gmail_oauth?.access_token).toBe("new");
  });
});
