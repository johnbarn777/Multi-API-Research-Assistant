import { adminDb } from "@/lib/firebase/admin";
import { startDeepResearchSession, submitDeepResearchAnswer, executeDeepResearch } from "@/lib/providers/openai";
import { runGeminiResearch } from "@/lib/providers/gemini";
import { buildResearchPdf } from "@/lib/pdf/builder";
import { sendResearchReport } from "@/lib/email";

// Placeholder orchestrator functions documented only. Actual implementations will
// interact with Firestore and provider SDKs.

export async function createResearchStub(title: string) {
  void adminDb;
  const session = await startDeepResearchSession(title);
  return {
    id: "stub-id",
    status: "refining",
    session
  };
}

export async function answerRefinementStub({
  sessionId,
  answer
}: {
  sessionId: string;
  answer: string;
}) {
  return submitDeepResearchAnswer({ sessionId, answer });
}

export async function runProvidersStub({
  sessionId,
  finalPrompt
}: {
  sessionId: string;
  finalPrompt: string;
}) {
  const [openAi, gemini] = await Promise.all([
    executeDeepResearch({ sessionId, prompt: finalPrompt }),
    runGeminiResearch(finalPrompt)
  ]);

  return { openAi, gemini };
}

export async function finalizeResearchStub({
  openAi,
  gemini,
  email
}: {
  openAi: unknown;
  gemini: unknown;
  email: string;
}) {
  const pdfBytes = await buildResearchPdf({
    title: "placeholder",
    userEmail: email,
    createdAt: new Date().toISOString(),
    openAi: openAi as any,
    gemini: gemini as any
  });

  const emailResult = await sendResearchReport({
    to: email,
    subject: "Research report (stub)",
    body: "Research report delivery placeholder.",
    pdfBuffer: Buffer.from(pdfBytes),
    gmailTokens: null
  });

  return emailResult;
}
