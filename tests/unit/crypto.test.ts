import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { encryptGmailToken, decryptGmailToken } from "@/lib/security/crypto";
import { resetEnvCache } from "@/config/env";

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

const OPTIONAL_KEYS = ["SENDGRID_API_KEY"] as const;

const ORIGINAL_ENV: Partial<Record<string, string | undefined>> = {};

function setEnv() {
  resetEnvCache();
  for (const key of Object.keys(REQUIRED_ENV)) {
    ORIGINAL_ENV[key] ??= process.env[key];
    process.env[key] = REQUIRED_ENV[key];
  }

  for (const key of OPTIONAL_KEYS) {
    ORIGINAL_ENV[key] ??= process.env[key];
    delete process.env[key];
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

describe("gmail token crypto helper", () => {
  beforeEach(() => {
    setEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("round-trips encryption and decryption", () => {
    const plaintext = JSON.stringify({
      access_token: "access-token",
      refresh_token: "refresh-token",
      expiry_date: Date.now()
    });

    const encrypted = encryptGmailToken(plaintext);
    expect(encrypted.startsWith("gma1:")).toBe(true);

    const decrypted = decryptGmailToken(encrypted);
    expect(decrypted).toBe(plaintext);
  });
});
