import type { ProviderResult } from "@/types/research";

export interface OpenAIDeepResearchRunPayload {
  id?: string;
  status?: string;
  output?: {
    summary?: string;
    insights?: Array<{
      title?: string;
      bullets?: string[];
      content?: string[];
    }>;
    sources?: Array<{
      title?: string;
      url?: string;
    }>;
  };
  usage?: {
    total_tokens?: number;
    model?: string;
    started_at?: string;
    completed_at?: string;
  };
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export function normalizeOpenAIDeepResearchResult(
  payload: OpenAIDeepResearchRunPayload
): ProviderResult {
  const output = payload.output ?? {};
  const summary = sanitizeText(output.summary) ?? "";

  const insights: string[] = [];
  if (Array.isArray(output.insights)) {
    for (const insight of output.insights) {
      if (!insight) {
        continue;
      }
      if (insight.title) {
        insights.push(insight.title.trim());
      }
      const bullets = insight.bullets ?? insight.content ?? [];
      if (Array.isArray(bullets)) {
        for (const bullet of bullets) {
          if (typeof bullet === "string" && bullet.trim().length > 0) {
            insights.push(bullet.trim());
          }
        }
      }
    }
  }

  const sources = Array.isArray(output.sources)
    ? output.sources
        .filter((source): source is { title?: string; url?: string } => Boolean(source))
        .map((source) => ({
          title: source.title?.trim() ?? "",
          url: source.url ?? ""
        }))
        .filter((source) => source.title.length > 0 || source.url.length > 0)
    : undefined;

  const metaData = (payload.meta ?? {}) as Record<string, unknown>;
  const metaTokens =
    payload.usage?.total_tokens ?? (typeof metaData.tokens === "number" ? metaData.tokens : undefined);
  const metaModel =
    payload.usage?.model ?? (typeof metaData.model === "string" ? metaData.model : undefined);
  const startedAt =
    payload.usage?.started_at ??
    (typeof metaData.startedAt === "string" ? metaData.startedAt : undefined);
  const completedAt =
    payload.usage?.completed_at ??
    (typeof metaData.completedAt === "string" ? metaData.completedAt : undefined);

  const meta =
    metaTokens || metaModel || startedAt || completedAt
      ? {
          tokens: metaTokens,
          model: metaModel,
          startedAt,
          completedAt
        }
      : undefined;

  return {
    raw: payload,
    summary,
    insights,
    sources,
    meta
  };
}

export interface GeminiGenerateContentPayload {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
  modelVersion?: string;
  usageMetadata?: {
    totalTokenCount?: number;
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
  safetyRatings?: Array<{
    category?: string;
    probability?: string;
  }>;
  [key: string]: unknown;
}

export function normalizeGeminiResult(
  payload: GeminiGenerateContentPayload
): ProviderResult {
  const candidates = payload.candidates ?? [];
  const textChunks: string[] = [];

  for (const candidate of candidates) {
    const parts = candidate?.content?.parts ?? [];
    for (const part of parts) {
      if (typeof part?.text === "string" && part.text.trim().length > 0) {
        textChunks.push(part.text.trim());
      }
    }
  }

  const combined = textChunks.join("\n").trim();
  const lines = combined.length > 0 ? combined.split(/\n+/).map((line) => line.trim()) : [];
  const summary = lines[0] ?? "";
  const insights = lines.slice(1).filter((line) => line.length > 0);

  const tokens = payload.usageMetadata?.totalTokenCount;
  const meta = tokens
    ? {
        tokens,
        model: payload.modelVersion
      }
    : payload.modelVersion
      ? {
          model: payload.modelVersion
        }
      : undefined;

  return {
    raw: payload,
    summary,
    insights,
    meta
  };
}

function sanitizeText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
