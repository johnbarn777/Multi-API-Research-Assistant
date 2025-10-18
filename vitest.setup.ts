import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "@/tests/mocks/server";
import { resetEnvCache } from "@/config/env";

const TEST_SERVER_ENV: Record<string, string> = {
  FIREBASE_PROJECT_ID: "test-project",
  FIREBASE_CLIENT_EMAIL: "service@test.dev",
  FIREBASE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nMIIBOgIBAAJBAK==\\n-----END PRIVATE KEY-----\\n",
  OPENAI_API_KEY: "test-openai-key",
  OPENAI_DR_BASE_URL: "https://openai.example.com",
  GEMINI_API_KEY: "test-gemini-key",
  GEMINI_BASE_URL: "https://gemini.example.com",
  GEMINI_MODEL: "models/test",
  GOOGLE_OAUTH_CLIENT_ID: "client-id",
  GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
  GOOGLE_OAUTH_REDIRECT_URI: "https://example.com/oauth",
  GOOGLE_OAUTH_SCOPES: "profile email",
  TOKEN_ENCRYPTION_KEY: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
  SENDGRID_API_KEY: "sendgrid-key",
  FROM_EMAIL: "reports@example.com",
  APP_BASE_URL: "https://app.example.com",
  DEMO_MODE: "false"
};

const TEST_PUBLIC_ENV: Record<string, string> = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "test-public-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "test.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "test-project",
  NEXT_PUBLIC_FIREBASE_APP_ID: "test-app-id",
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: "G-TEST123"
};

for (const [key, value] of Object.entries({
  ...TEST_SERVER_ENV,
  ...TEST_PUBLIC_ENV
})) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}

resetEnvCache();

beforeAll(() => {
  server.listen({ onUnhandledRequest: "warn" });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
