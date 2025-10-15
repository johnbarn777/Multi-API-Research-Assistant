import { z } from "zod";

const envSchema = z.object({
  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_CLIENT_EMAIL: z.string().email(),
  FIREBASE_PRIVATE_KEY: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_DR_BASE_URL: z.string().url(),
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_BASE_URL: z.string().url(),
  GEMINI_MODEL: z.string().min(1),
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().url(),
  GOOGLE_OAUTH_SCOPES: z.string().min(1),
  TOKEN_ENCRYPTION_KEY: z.string().min(1),
  SENDGRID_API_KEY: z.string().optional(),
  FROM_EMAIL: z.string().email(),
  APP_BASE_URL: z.string().url()
});

type EnvConfig = z.infer<typeof envSchema>;

let cache: EnvConfig | null = null;

export function getEnv(): EnvConfig {
  if (cache) {
    return cache;
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment variables: ${parsed.error.message}`);
  }

  cache = parsed.data;
  return cache;
}
