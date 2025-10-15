import { GoogleGenerativeAI } from "@google/generative-ai";
import { getServerEnv } from "@/config/env";
import type { ProviderResult } from "@/types/research";

let client: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (client) {
    return client;
  }

  const env = getServerEnv();
  client = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  return client;
}

export async function runGeminiResearch(prompt: string): Promise<ProviderResult> {
  const env = getServerEnv();
  const genAI = getClient();
  void env; // TODO: use env.GEMINI_MODEL when executing the request.

  // TODO: Send prompt to Gemini and normalize the response.
  return {
    raw: {},
    summary: "Placeholder Gemini summary",
    insights: ["Gemini insights will be populated when integration is complete."]
  };
}
