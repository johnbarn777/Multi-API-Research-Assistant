import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FirebaseTokenVerificationError,
  verifyFirebaseIdToken
} from "@/lib/firebase/tokenVerifier";
import { resetEnvCache } from "@/config/env";

const originalEnv = {
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

function mockFetchImplementation(response: {
  ok: boolean;
  status?: number;
  body: unknown;
}) {
  return vi.fn().mockImplementation(async () => ({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 400),
    async json() {
      return response.body;
    }
  }));
}

describe("verifyFirebaseIdToken", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "test-api-key";
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = "example.firebaseapp.com";
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "example-project";
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID = "example-app-id";
    resetEnvCache();
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key as keyof typeof process.env];
      } else {
        process.env[key as keyof typeof process.env] = value;
      }
    }
    resetEnvCache();
    vi.unstubAllGlobals();
  });

  it("returns uid and email when lookup succeeds", async () => {
    const fetchMock = mockFetchImplementation({
      ok: true,
      body: {
        users: [
          {
            localId: "user-123",
            email: "user@example.com"
          }
        ]
      }
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyFirebaseIdToken("valid-token");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=test-api-key",
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ idToken: "valid-token" })
      }
    );
    expect(result).toEqual({ uid: "user-123", email: "user@example.com" });
  });

  it("throws when the lookup request fails", async () => {
    const fetchMock = mockFetchImplementation({
      ok: false,
      body: {
        error: { message: "INVALID_ID_TOKEN" }
      }
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyFirebaseIdToken("bad-token")).rejects.toThrow(
      new FirebaseTokenVerificationError("INVALID_ID_TOKEN")
    );
  });

  it("throws when the response is missing a user", async () => {
    const fetchMock = mockFetchImplementation({
      ok: true,
      body: {}
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyFirebaseIdToken("missing-user")).rejects.toThrow(
      new FirebaseTokenVerificationError("Invalid Firebase ID token")
    );
  });
});
