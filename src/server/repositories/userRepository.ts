import { adminDb } from "@/lib/firebase/admin";
import type { GmailOAuthTokens, UserProfile } from "@/types/research";
import {
  Timestamp,
  type CollectionReference,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot
} from "firebase-admin/firestore";

export interface UpsertUserProfileInput {
  email: string;
  displayName: string;
  photoURL?: string;
}

export interface UpdateUserProfileInput {
  email?: string;
  displayName?: string;
  photoURL?: string | null;
}

export interface UserRepository {
  getById(uid: string): Promise<UserProfile | null>;
  upsertGmailTokens(
    uid: string,
    tokens: GmailOAuthTokens | null,
    profile?: UpsertUserProfileInput
  ): Promise<UserProfile>;
  updateProfile(uid: string, update: UpdateUserProfileInput): Promise<UserProfile>;
}

const userConverter: FirestoreDataConverter<UserProfile> = {
  toFirestore(user: UserProfile) {
    return user;
  },
  fromFirestore(snapshot: QueryDocumentSnapshot<UserProfile>) {
    const data = snapshot.data();
    return {
      ...data,
      uid: data.uid ?? snapshot.id
    };
  }
};

export class FirestoreUserRepository implements UserRepository {
  private readonly collection: CollectionReference<UserProfile>;
  private readonly now: () => Timestamp;

  constructor(options?: {
    collection?: CollectionReference<UserProfile>;
    now?: () => Timestamp;
  }) {
    this.collection =
      options?.collection ??
      adminDb().collection("users").withConverter(userConverter);
    this.now = options?.now ?? (() => Timestamp.now());
  }

  async getById(uid: string): Promise<UserProfile | null> {
    const snapshot = await this.collection.doc(uid).get();
    if (!snapshot.exists) {
      return null;
    }

    return snapshot.data()!;
  }

  async upsertGmailTokens(
    uid: string,
    tokens: GmailOAuthTokens | null,
    profile?: UpsertUserProfileInput
  ): Promise<UserProfile> {
    const docRef = this.collection.doc(uid);
    const snapshot = await docRef.get();
    const now = this.now();

    if (!snapshot.exists) {
      if (!profile) {
        throw new Error("Profile details are required to create a user document");
      }

      const user: UserProfile = {
        uid,
        email: profile.email,
        displayName: profile.displayName,
        photoURL: profile.photoURL,
        gmail_oauth: tokens ?? undefined,
        createdAt: now,
        updatedAt: now
      };

      await docRef.set(user, { merge: false });
      return user;
    }

    const current = snapshot.data()!;
    const next: UserProfile = {
      ...current,
      email: profile?.email ?? current.email,
      displayName: profile?.displayName ?? current.displayName,
      photoURL: profile?.photoURL ?? current.photoURL,
      gmail_oauth: tokens ?? undefined,
      updatedAt: now
    };

    await docRef.set(next, { merge: false });
    return next;
  }

  async updateProfile(
    uid: string,
    update: UpdateUserProfileInput
  ): Promise<UserProfile> {
    const docRef = this.collection.doc(uid);
    const snapshot = await docRef.get();

    if (!snapshot.exists) {
      throw new Error(`User ${uid} not found`);
    }

    const current = snapshot.data()!;
    const now = this.now();

    const next: UserProfile = {
      ...current,
      email: update.email ?? current.email,
      displayName: update.displayName ?? current.displayName,
      photoURL:
        update.photoURL === null ? undefined : update.photoURL ?? current.photoURL,
      updatedAt: now
    };

    await docRef.set(next, { merge: false });
    return next;
  }
}

let userRepositoryOverride: UserRepository | null = null;
let cachedUserRepository: UserRepository | null = null;

export function setUserRepository(instance: UserRepository | null) {
  userRepositoryOverride = instance;
}

export function getUserRepository(): UserRepository {
  if (userRepositoryOverride) {
    return userRepositoryOverride;
  }

  if (!cachedUserRepository) {
    cachedUserRepository = new FirestoreUserRepository();
  }

  return cachedUserRepository;
}
