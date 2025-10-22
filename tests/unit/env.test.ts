import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getPublicEnv,
  getServerEnv,
  resetEnvCache
} from "@/config/env";

const REQUIRED_ENV: Record<string, string> = {
  FIREBASE_PROJECT_ID: "test-project",
  FIREBASE_CLIENT_EMAIL: "firebase-admin@test-project.iam.gserviceaccount.com",
  FIREBASE_PRIVATE_KEY:
    "-----BEGIN PRIVATE KEY-----\\nline1\\nline2\\n-----END PRIVATE KEY-----",
  OPENAI_API_KEY: "openai-test-key",
  OPENAI_DR_BASE_URL: "https://api.openai.com/v1",
  GEMINI_API_KEY: "gemini-test-key",
  GEMINI_BASE_URL: "https://generativelanguage.googleapis.com/v1",
  GEMINI_MODEL: "gemini-2.0-pro",
  GOOGLE_OAUTH_CLIENT_ID: "oauth-client-id.apps.googleusercontent.com",
  GOOGLE_OAUTH_CLIENT_SECRET: "oauth-client-secret",
  GOOGLE_OAUTH_REDIRECT_URI: "https://example.com/oauth/callback",
  GOOGLE_OAUTH_SCOPES: "https://www.googleapis.com/auth/gmail.send",
  TOKEN_ENCRYPTION_KEY:
    "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=",
  FROM_EMAIL: "noreply@example.com",
  APP_BASE_URL: "http://localhost:3000",
  NEXT_PUBLIC_FIREBASE_API_KEY: "public-api-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "test.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "test-project",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:123:web:abc"
};

const OPTIONAL_KEYS = [
  "SENDGRID_API_KEY",
  "FIREBASE_STORAGE_BUCKET",
  "DEMO_MODE",
  "OPENAI_PROJECT_ID",
  "OPENAI_DR_MODEL",
  "OPENAI_CLARIFIER_MODEL",
  "OPENAI_PROMPT_WRITER_MODEL"
] as const;

const ORIGINAL_ENV: Partial<Record<string, string | undefined>> = {};

function setEnv(overrides: Record<string, string | undefined> = {}) {
  resetEnvCache();
  for (const key of Object.keys(REQUIRED_ENV)) {
    ORIGINAL_ENV[key] ??= process.env[key];
    process.env[key] = overrides[key] ?? REQUIRED_ENV[key];
  }

  for (const key of OPTIONAL_KEYS) {
    ORIGINAL_ENV[key] ??= process.env[key];
    const override = overrides[key];
    if (override === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = override;
  }
}

function restoreEnv() {
  resetEnvCache();
  for (const key of Object.keys(REQUIRED_ENV)) {
    const original = ORIGINAL_ENV[key];
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }

  for (const key of OPTIONAL_KEYS) {
    const original = ORIGINAL_ENV[key];
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
}

describe("environment parser", () => {
  beforeEach(() => {
    setEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("parses server and public environment variables", () => {
    const serverEnv = getServerEnv();
    const publicEnv = getPublicEnv();

    expect(serverEnv.FIREBASE_PROJECT_ID).toBe(REQUIRED_ENV.FIREBASE_PROJECT_ID);
    expect(serverEnv.FIREBASE_PRIVATE_KEY).toContain("\nline1\n");
    expect(serverEnv.TOKEN_ENCRYPTION_KEY).toBe(
      REQUIRED_ENV.TOKEN_ENCRYPTION_KEY
    );

    expect(publicEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID).toBe(
      REQUIRED_ENV.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    );
    expect(serverEnv.DEMO_MODE).toBe(false);
  });

  it("throws when a required variable is missing", () => {
    delete process.env.OPENAI_API_KEY;
    resetEnvCache();

    expect(() => getServerEnv()).toThrowError(/Invalid server environment/);
  });
 
  it("interprets demo mode flag values", () => {
    setEnv({ DEMO_MODE: "true" });
    expect(getServerEnv().DEMO_MODE).toBe(true);

    setEnv({ DEMO_MODE: "0" });
    expect(getServerEnv().DEMO_MODE).toBe(false);
  });
});
