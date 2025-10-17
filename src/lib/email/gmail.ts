import { randomUUID } from "node:crypto";
import { google } from "googleapis";
import { getServerEnv } from "@/config/env";
import { decryptGmailToken } from "@/lib/security/crypto";
import { logger } from "@/lib/utils/logger";

export type GmailTokens = {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
  scope?: string | null;
};

export type GmailSendSuccess = {
  ok: true;
  messageId: string;
  tokens?: GmailTokens;
};

export type GmailSendFailure = {
  ok: false;
  reason: string;
  shouldInvalidateCredentials?: boolean;
  tokens?: GmailTokens;
  error?: unknown;
};

export type GmailSendResult = GmailSendSuccess | GmailSendFailure;

type GmailSendParams = {
  to: string;
  subject: string;
  body: string;
  pdfBuffer: Buffer;
  filename: string;
  tokens: GmailTokens;
  from?: string;
};

const ENCRYPTED_PREFIX = "gma1:";
const ACCESS_EXPIRY_BUFFER_MS = 60_000;

function normalizeLineEndings(input: string) {
  return input.replace(/\r?\n/g, "\r\n");
}

function chunkBase64(input: string, size = 76) {
  const chunks: string[] = [];
  for (let index = 0; index < input.length; index += size) {
    chunks.push(input.slice(index, index + size));
  }
  return chunks.join("\r\n");
}

function encodeBase64Url(input: string) {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

function sanitizeFilename(filename: string) {
  return filename.replace(/"/g, "").replace(/(\r|\n)/g, "");
}

function buildRfc822Message({
  to,
  from,
  subject,
  body,
  pdfBuffer,
  filename
}: Omit<GmailSendParams, "tokens">) {
  const boundary = `mixed_${randomUUID()}`;
  const safeFilename = sanitizeFilename(filename);

  const base64Attachment = chunkBase64(pdfBuffer.toString("base64"));

  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    normalizeLineEndings(body),
    "",
    `--${boundary}`,
    `Content-Type: application/pdf; name="${safeFilename}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${safeFilename}"`,
    "",
    base64Attachment,
    "",
    `--${boundary}--`,
    ""
  ].join("\r\n");
}

function isTokenExpired(expiryDate?: number | null) {
  if (!expiryDate) {
    return true;
  }
  return Date.now() + ACCESS_EXPIRY_BUFFER_MS >= expiryDate;
}

function decryptToken(value?: string | null) {
  if (!value) {
    return null;
  }

  if (!value.startsWith(ENCRYPTED_PREFIX)) {
    return value;
  }

  try {
    return decryptGmailToken(value);
  } catch (error) {
    logger.error("email.gmail.decrypt_failed", {
      error: error instanceof Error ? error.message : String(error)
    });
    throw new Error("Invalid encrypted Gmail token");
  }
}

function interpretError(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "response" in error &&
    error.response &&
    typeof error.response === "object"
  ) {
    const response = error.response as {
      status?: number;
      data?: { error?: string; error_description?: string };
    };

    const status = response.status;
    const code = response.data?.error;
    const description = response.data?.error_description;

    return {
      status,
      code,
      description,
      shouldInvalidate:
        status === 401 ||
        code === "invalid_grant" ||
        code === "invalid_client" ||
        code === "unauthorized_client"
    };
  }

  return {
    status: undefined,
    code: undefined,
    description: undefined,
    shouldInvalidate: false
  };
}

export async function sendWithGmail(params: GmailSendParams): Promise<GmailSendResult> {
  const env = getServerEnv();
  const fromAddress = params.from ?? params.to;

  let refreshToken: string | null;
  let accessToken: string | null;

  try {
    refreshToken = decryptToken(params.tokens.refresh_token);
    accessToken = decryptToken(params.tokens.access_token);
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Failed to decrypt Gmail credentials",
      shouldInvalidateCredentials: true,
      error
    };
  }

  if (!refreshToken) {
    logger.warn("email.gmail.missing_refresh_token", {
      to: params.to
    });
    return {
      ok: false,
      reason: "Missing Gmail refresh token",
      shouldInvalidateCredentials: true
    };
  }

  const oauth2Client = new google.auth.OAuth2(
    env.GOOGLE_OAUTH_CLIENT_ID,
    env.GOOGLE_OAUTH_CLIENT_SECRET,
    env.GOOGLE_OAUTH_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    refresh_token: refreshToken,
    access_token: accessToken ?? undefined,
    expiry_date: params.tokens.expiry_date ?? undefined,
    scope: params.tokens.scope ?? undefined
  });

  let nextTokens: GmailTokens | undefined = {
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: params.tokens.expiry_date ?? null,
    scope: params.tokens.scope ?? null
  };

  if (!accessToken || isTokenExpired(params.tokens.expiry_date)) {
    try {
      const refreshed = await oauth2Client.refreshAccessToken();
      const credentials = refreshed.credentials;

      accessToken = credentials.access_token ?? null;
      const refreshedRefreshToken = credentials.refresh_token ?? refreshToken;
      const expiryDate = credentials.expiry_date ?? null;
      const scope = credentials.scope ?? params.tokens.scope ?? null;

      oauth2Client.setCredentials({
        refresh_token: refreshedRefreshToken ?? undefined,
        access_token: accessToken ?? undefined,
        expiry_date: expiryDate ?? undefined,
        scope: typeof scope === "string" ? scope : undefined
      });

      nextTokens = {
        access_token: accessToken,
        refresh_token: refreshedRefreshToken,
        expiry_date: expiryDate,
        scope: typeof scope === "string" ? scope : null
      };
    } catch (error) {
      const interpreted = interpretError(error);
      logger.error("email.gmail.refresh_failed", {
        to: params.to,
        status: interpreted.status,
        code: interpreted.code,
        description: interpreted.description
      });

      return {
        ok: false,
        reason: "Failed to refresh Gmail access token",
        shouldInvalidateCredentials: interpreted.shouldInvalidate,
        tokens: nextTokens,
        error
      };
    }
  }

  const mimeMessage = buildRfc822Message({
    to: params.to,
    from: fromAddress,
    subject: params.subject,
    body: params.body,
    pdfBuffer: params.pdfBuffer,
    filename: params.filename
  });

  const gmailClient = google.gmail({
    version: "v1",
    auth: oauth2Client
  });

  try {
    const response = await gmailClient.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodeBase64Url(mimeMessage)
      }
    });

    const messageId = response.data.id ?? "unknown";

    logger.info("email.gmail.sent", {
      to: params.to,
      messageId
    });

    return {
      ok: true,
      messageId,
      tokens: nextTokens
    };
  } catch (error) {
    const interpreted = interpretError(error);
    logger.error("email.gmail.send_failed", {
      to: params.to,
      status: interpreted.status,
      code: interpreted.code,
      description: interpreted.description
    });

    const reason =
      interpreted.code === "insufficient_permissions"
        ? "Gmail API permissions were revoked"
        : "Failed to send email with Gmail";

    return {
      ok: false,
      reason,
      shouldInvalidateCredentials: interpreted.shouldInvalidate,
      tokens: nextTokens,
      error
    };
  }
}
