import { adminDb } from "@/lib/firebase/admin";
import {
  executeRun as executeOpenAiRun,
  pollResult as pollOpenAiResult,
  startSession as startOpenAiSession,
  submitAnswer as submitOpenAiAnswer
} from "@/lib/providers/openaiDeepResearch";
import { generateContent as generateGeminiContent } from "@/lib/providers/gemini";
import { buildResearchPdf } from "@/lib/pdf/builder";
import { sendResearchReport } from "@/lib/email";

// Placeholder orchestrator functions documented only. Actual implementations will
// interact with Firestore and provider SDKs.

export async function createResearchStub(title: string) {
  void adminDb;
  const session = await startOpenAiSession({ topic: title });
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
  return submitOpenAiAnswer({ sessionId, answer });
}

export async function runProvidersStub({
  sessionId,
  finalPrompt
}: {
  sessionId: string;
  finalPrompt: string;
}) {
  const [openAi, gemini] = await Promise.all([
    (async () => {
      const { runId } = await executeOpenAiRun({ sessionId, prompt: finalPrompt });
      const { result } = await pollOpenAiResult({ runId });
      if (!result) {
        throw new Error("OpenAI Deep Research run completed without a result payload");
      }
      return result;
    })(),
    generateGeminiContent({ prompt: finalPrompt })
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
