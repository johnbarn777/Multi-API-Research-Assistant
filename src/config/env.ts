import { z } from "zod";

const BASE64_REGEX =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const serverSchema = z.object({
  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_CLIENT_EMAIL: z.string().email(),
  FIREBASE_PRIVATE_KEY: z
    .string()
    .min(1)
    .transform((value) => value.replace(/\\n/g, "\n")),
  FIREBASE_STORAGE_BUCKET: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_DR_BASE_URL: z.string().url(),
  OPENAI_PROJECT_ID: z.string().min(1).optional(),
  OPENAI_DR_MODEL: z.string().min(1).optional(),
  OPENAI_CLARIFIER_MODEL: z.string().min(1).optional(),
  OPENAI_PROMPT_WRITER_MODEL: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_BASE_URL: z.string().url(),
  GEMINI_MODEL: z.string().min(1),
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().url(),
  GOOGLE_OAUTH_SCOPES: z.string().min(1),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .min(1)
    .transform((value, ctx) => {
      const normalized = value.trim();
      if (!BASE64_REGEX.test(normalized) || normalized.length % 4 !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "TOKEN_ENCRYPTION_KEY must be a valid base64 string"
        });
        return z.NEVER;
      }

      const padding = normalized.endsWith("==")
        ? 2
        : normalized.endsWith("=")
          ? 1
          : 0;
      const byteLength = (normalized.length / 4) * 3 - padding;
      if (byteLength !== 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "TOKEN_ENCRYPTION_KEY must decode to 32 bytes"
        });
        return z.NEVER;
      }

      return normalized;
    }),
  SENDGRID_API_KEY: z.string().min(1).optional(),
  FROM_EMAIL: z.string().email(),
  APP_BASE_URL: z.string().url(),
  DEMO_MODE: z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined) {
        return false;
      }
      const normalized = value.trim().toLowerCase();
      if (normalized.length === 0) {
        return false;
      }
      if (["1", "true", "yes", "on"].includes(normalized)) {
        return true;
      }
      if (["0", "false", "no", "off"].includes(normalized)) {
        return false;
      }
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "DEMO_MODE must be true/false"
      });
      return z.NEVER;
    })
});

const publicSchema = z.object({
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: z.string().min(1).optional()
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type PublicEnv = z.infer<typeof publicSchema>;

let serverEnvCache: ServerEnv | null = null;
let publicEnvCache: PublicEnv | null = null;

function parseServerEnv(): ServerEnv {
  if (serverEnvCache) {
    return serverEnvCache;
  }

  const parsed = serverSchema.safeParse({
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
    FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_DR_BASE_URL: process.env.OPENAI_DR_BASE_URL,
    OPENAI_PROJECT_ID: process.env.OPENAI_PROJECT_ID,
    OPENAI_DR_MODEL: process.env.OPENAI_DR_MODEL,
    OPENAI_CLARIFIER_MODEL: process.env.OPENAI_CLARIFIER_MODEL,
    OPENAI_PROMPT_WRITER_MODEL: process.env.OPENAI_PROMPT_WRITER_MODEL,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_BASE_URL: process.env.GEMINI_BASE_URL,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
    GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    GOOGLE_OAUTH_REDIRECT_URI: process.env.GOOGLE_OAUTH_REDIRECT_URI,
    GOOGLE_OAUTH_SCOPES: process.env.GOOGLE_OAUTH_SCOPES,
    TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY,
    SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
    FROM_EMAIL: process.env.FROM_EMAIL,
    APP_BASE_URL: process.env.APP_BASE_URL,
    DEMO_MODE: process.env.DEMO_MODE
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid server environment variables: ${parsed.error.message}`
    );
  }

  serverEnvCache = parsed.data;
  return serverEnvCache;
}

function parsePublicEnv(): PublicEnv {
  if (publicEnvCache) {
    return publicEnvCache;
  }

  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID:
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID:
      process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid public environment variables: ${parsed.error.message}`
    );
  }

  publicEnvCache = parsed.data;
  return publicEnvCache;
}

export function getServerEnv(): ServerEnv {
  return parseServerEnv();
}

export function getPublicEnv(): PublicEnv {
  return parsePublicEnv();
}

export function getEnv(): ServerEnv & PublicEnv {
  return { ...getServerEnv(), ...getPublicEnv() };
}

export function resetEnvCache(): void {
  serverEnvCache = null;
  publicEnvCache = null;
}
