import OpenAI from "openai";
import { getServerEnv } from "@/config/env";
import type { ProviderResult } from "@/types/research";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (client) {
    return client;
  }

  const env = getServerEnv();
  client = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    baseURL: env.OPENAI_DR_BASE_URL
  });
  return client;
}

export async function startDeepResearchSession(topic: string) {
  getClient();
  // TODO: call OpenAI Deep Research session creation endpoint when available.
  return {
    sessionId: "stub-session",
    questions: [
      {
        index: 1,
        text: `What specific focus should we apply to the topic "${topic}"?`
      }
    ]
  };
}

export async function submitDeepResearchAnswer(_: {
  sessionId: string;
  answer: string;
}): Promise<{ nextQuestion?: string; finalPrompt?: string }> {
  getClient();
  // TODO: implement API exchange and parsing logic.
  return {
    nextQuestion: "Stub next question — replace with OpenAI response.",
    finalPrompt: undefined
  };
}

export async function executeDeepResearch(_: {
  sessionId: string;
  prompt: string;
}): Promise<ProviderResult> {
  getClient();
  // TODO: call the execution endpoint and normalize the payload.
  return {
    raw: {},
    summary: "Placeholder summary from OpenAI Deep Research.",
    insights: [
      "Replace with normalized insights derived from the provider response."
    ]
  };
}
