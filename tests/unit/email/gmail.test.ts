import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendWithGmail } from "@/lib/email/gmail";
import { encryptGmailToken } from "@/lib/security/crypto";

const TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

const oauthClientMock = {
  setCredentials: vi.fn(),
  refreshAccessToken: vi.fn()
};

const gmailSendMock = vi.fn();

const mockEnv = vi.hoisted(() => ({
  getServerEnv: vi.fn()
}));

vi.mock("@/config/env", () => ({
  getServerEnv: mockEnv.getServerEnv
}));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: vi.fn(() => oauthClientMock)
    },
    gmail: vi.fn(() => ({
      users: {
        messages: {
          send: gmailSendMock
        }
      }
    }))
  }
}));

function decodeRawMessage(raw: string) {
  const base64 = raw.replace(/-/g, "+").replace(/_/g, "/");
  const padded =
    base64.length % 4 === 0 ? base64 : `${base64}${"=".repeat(4 - (base64.length % 4))}`;
  return Buffer.from(padded, "base64").toString("utf8");
}

describe("sendWithGmail", () => {
  beforeEach(() => {
    mockEnv.getServerEnv.mockReturnValue({
      FIREBASE_PROJECT_ID: "test-project",
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

    oauthClientMock.setCredentials.mockReset();
    oauthClientMock.refreshAccessToken.mockReset();
    gmailSendMock.mockReset();
  });

  it("builds an RFC822 message with the PDF attachment", async () => {
    gmailSendMock.mockResolvedValue({
      data: {
        id: "gmail-123"
      }
    });

    oauthClientMock.refreshAccessToken.mockResolvedValue({
      credentials: {
        access_token: "new-access",
        refresh_token: "new-refresh",
        expiry_date: Date.now() + 3_600_000
      }
    });

    const tokens = {
      access_token: encryptGmailToken("access-token"),
      refresh_token: encryptGmailToken("refresh-token"),
      expiry_date: Date.now() - 5_000,
      scope: "gmail.send"
    };

    const pdfBuffer = Buffer.from("%PDF-1.4 mock");

    const result = await sendWithGmail({
      to: "recipient@example.com",
      subject: "Subject line",
      body: "This is the body.",
      pdfBuffer,
      filename: "research-report.pdf",
      tokens,
      from: "sender@example.com"
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.messageId).toBe("gmail-123");
      expect(result.tokens?.access_token).toBe("new-access");
      expect(result.tokens?.refresh_token).toBe("new-refresh");
    }

    expect(oauthClientMock.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(gmailSendMock).toHaveBeenCalledTimes(1);

    const payload = gmailSendMock.mock.calls[0][0];
    expect(payload).toMatchObject({
      userId: "me",
      requestBody: expect.objectContaining({
        raw: expect.any(String)
      })
    });

    const message = decodeRawMessage(payload.requestBody.raw);
    expect(message).toContain('Content-Type: application/pdf; name="research-report.pdf"');
    expect(message).toContain("Content-Transfer-Encoding: base64");
    expect(message).toContain("This is the body.");
    expect(message).toContain("Subject: Subject line");
    expect(message).toContain("From: sender@example.com");

    const attachmentBase64 = pdfBuffer.toString("base64");
    expect(message).toContain(attachmentBase64.slice(0, 20));
  });

  it("flags invalid credentials when token refresh fails", async () => {
    gmailSendMock.mockResolvedValue({
      data: {
        id: "gmail-456"
      }
    });

    oauthClientMock.refreshAccessToken.mockRejectedValue({
      response: {
        status: 401,
        data: {
          error: "invalid_grant",
          error_description: "Token has been revoked"
        }
      }
    });

    const tokens = {
      access_token: encryptGmailToken("stale-access"),
      refresh_token: encryptGmailToken("stale-refresh"),
      expiry_date: Date.now() - 1_000
    };

    const pdfBuffer = Buffer.from("%PDF-1.4 mock");

    const result = await sendWithGmail({
      to: "recipient@example.com",
      subject: "Subject line",
      body: "Body",
      pdfBuffer,
      filename: "report.pdf",
      tokens
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("Failed to refresh Gmail access token");
      expect(result.shouldInvalidateCredentials).toBe(true);
    }

    expect(gmailSendMock).not.toHaveBeenCalled();
  });
});
