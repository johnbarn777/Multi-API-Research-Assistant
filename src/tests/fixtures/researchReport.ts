import type { PdfPayload } from "@/lib/pdf/builder";
import type { ProviderResult } from "@/types/research";

export const SAMPLE_OPENAI_RESULT: ProviderResult = {
  raw: {
    id: "openai-run-123",
    provider: "openai"
  },
  summary:
    "OpenAI Deep Research identified core policy levers, stakeholder incentives, and projected timelines for safety regulation adoption.",
  insights: [
    "Policy harmonization across EU and US remains the largest blocker.",
    "Industry self-regulation accelerates adoption when paired with public transparency.",
    "Cross-disciplinary task forces reduce implementation time by 25%."
  ],
  sources: [
    {
      title: "AI Safety Governance Review",
      url: "https://example.com/ai-safety-governance"
    },
    {
      title: "EU Policy Roadmap 2025",
      url: "https://example.com/eu-roadmap-2025"
    }
  ],
  meta: {
    model: "o4-preview",
    tokens: 48231,
    startedAt: "2025-01-15T10:00:00.000Z",
    completedAt: "2025-01-15T10:04:32.000Z"
  }
};

export const SAMPLE_GEMINI_RESULT: ProviderResult = {
  raw: {
    id: "gemini-run-456",
    provider: "gemini"
  },
  summary:
    "Gemini highlighted regional adoption differences and surfaced emerging partnerships between public agencies and private labs.",
  insights: [
    "Japan prioritizes corporate accountability frameworks over fines.",
    "Public-private sandboxes provide measurable uplift to compliance timelines."
  ],
  sources: [
    {
      title: "Asia-Pacific Regulation Monitor",
      url: "https://example.com/apac-regulation"
    }
  ],
  meta: {
    model: "gemini-2.0-pro",
    tokens: 27190,
    startedAt: "2025-01-15T10:00:05.000Z",
    completedAt: "2025-01-15T10:02:47.000Z"
  }
};

export const SAMPLE_PDF_PAYLOAD: PdfPayload = {
  title: "Global AI Safety Regulation Outlook",
  userEmail: "researcher@example.com",
  createdAt: "2025-01-15T09:58:12.000Z",
  openAi: SAMPLE_OPENAI_RESULT,
  gemini: SAMPLE_GEMINI_RESULT
};
