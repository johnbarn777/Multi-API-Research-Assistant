import type { ProviderResult } from "@/types/research";

type RefinementQA = { index: number; text: string };
type AnswerEntry = { index: number; answer: string };

const QUESTION_TEMPLATES: Array<(topic: string) => string> = [
  (topic) => `Who is the primary audience or stakeholder for "${topic}"?`,
  (topic) => `What specific goals or outcomes should the research on "${topic}" achieve?`,
  () =>
    "List any constraints, success metrics, or critical timelines the research should respect."
];

const DEFAULT_AUDIENCE = "executive stakeholders";
const DEFAULT_OUTCOME = "a clear action roadmap";
const DEFAULT_CONSTRAINTS = "budget, timing, and regulatory considerations";

function sanitizeTopicForId(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function createSessionId(topic: string): string {
  const base = sanitizeTopicForId(topic) || "demo";
  const suffix = Math.random().toString(36).slice(2, 8);
  return `demo-session-${base}-${suffix}`;
}

function buildQuestions(topic: string): RefinementQA[] {
  return QUESTION_TEMPLATES.map((template, index) => ({
    index: index + 1,
    text: template(topic)
  }));
}

function toAnswerMap(answers: AnswerEntry[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const entry of answers) {
    const trimmed = entry.answer.trim();
    if (trimmed.length === 0) {
      continue;
    }
    map.set(entry.index, trimmed);
  }
  return map;
}

function buildDemoFinalPrompt(topic: string, answers: Map<number, string>): string {
  const audience = answers.get(1) ?? DEFAULT_AUDIENCE;
  const outcome = answers.get(2) ?? DEFAULT_OUTCOME;
  const constraints = answers.get(3) ?? DEFAULT_CONSTRAINTS;

  return [
    "You are a senior research analyst preparing a comparative intelligence brief.",
    `Topic: ${topic}`,
    `Primary audience: ${audience}`,
    `Desired outcomes: ${outcome}`,
    `Constraints & success metrics: ${constraints}`,
    "",
    "Deliver a structured report with the following sections: Executive Summary, Key Findings, Risks & Gaps, Recommendations, Suggested Next Steps.",
    "Surface at least three credible sources, contrasting perspectives, and cite them inline."
  ].join("\n");
}

export function createDemoResearchSession(topic: string): {
  sessionId: string;
  questions: RefinementQA[];
  raw: unknown;
} {
  const allQuestions = buildQuestions(topic);
  const firstQuestion = allQuestions.slice(0, 1);
  return {
    sessionId: createSessionId(topic),
    questions: firstQuestion,
    raw: {
      demo: true,
      topic,
      totalQuestions: allQuestions.length
    }
  };
}

export function getDemoRefinementResponse({
  topic,
  questionIndex,
  answer,
  existingAnswers
}: {
  topic: string;
  questionIndex: number;
  answer: string;
  existingAnswers: AnswerEntry[];
}): {
  nextQuestion?: RefinementQA;
  finalPrompt?: string;
  raw: unknown;
} {
  const normalizedAnswers = toAnswerMap(existingAnswers);
  normalizedAnswers.set(questionIndex, answer.trim());

  const questions = buildQuestions(topic);
  const nextQuestion = questions.find((question) => question.index === questionIndex + 1);
  const finalPrompt =
    questionIndex >= questions.length ? buildDemoFinalPrompt(topic, normalizedAnswers) : undefined;

  return {
    nextQuestion: nextQuestion ?? undefined,
    finalPrompt,
    raw: {
      demo: true,
      topic,
      questionIndex,
      answers: Object.fromEntries(normalizedAnswers.entries())
    }
  };
}

function buildDemoProviderResult(
  provider: "openai" | "gemini",
  {
    topic,
    prompt,
    answers
  }: {
    topic: string;
    prompt: string;
    answers: AnswerEntry[];
  }
): ProviderResult {
  const answerMap = toAnswerMap(answers);
  const audience = answerMap.get(1) ?? DEFAULT_AUDIENCE;
  const outcome = answerMap.get(2) ?? DEFAULT_OUTCOME;
  const constraints = answerMap.get(3) ?? DEFAULT_CONSTRAINTS;

  const sharedSummary = `Structured research guidance for "${topic}" tailored to ${audience}, emphasizing ${outcome} within ${constraints}.`;

  const baseInsights = [
    `Audience emphasis: ${audience}`,
    `Desired outcomes: ${outcome}`,
    `Key constraints: ${constraints}`
  ];

  const providerSpecificInsights =
    provider === "openai"
      ? [
          "Synthesizes analyst-style talking points and risks.",
          "Highlights contrasting viewpoints from industry and academic sources."
        ]
      : [
          "Captures forward-looking opportunities and potential blockers.",
          "Pairs qualitative sentiment with quantitative leading indicators."
        ];

  const sources =
    provider === "openai"
      ? [
          {
            title: "Global Industry Outlook (Demo)",
            url: "https://example.com/demo-industry-outlook"
          },
          {
            title: "Analyst Interview Transcript (Demo)",
            url: "https://example.com/demo-analyst-interview"
          }
        ]
      : [
          {
            title: "Emerging Trends Brief (Demo)",
            url: "https://example.com/demo-trends"
          },
          {
            title: "Customer Sentiment Pulse (Demo)",
            url: "https://example.com/demo-sentiment"
          }
        ];

  const nowIso = new Date().toISOString();

  return {
    raw: {
      provider,
      mode: "demo",
      prompt,
      answers: Object.fromEntries(answerMap.entries())
    },
    summary: sharedSummary,
    insights: [...baseInsights, ...providerSpecificInsights],
    sources,
    meta: {
      model: provider === "openai" ? "demo-openai-analyst" : "demo-gemini-visionary",
      tokens: provider === "openai" ? 1280 : 1120,
      startedAt: nowIso,
      completedAt: nowIso
    }
  };
}

export function getDemoProviderResults({
  topic,
  prompt,
  answers
}: {
  topic: string;
  prompt: string;
  answers: AnswerEntry[];
}): {
  openAi: ProviderResult;
  gemini: ProviderResult;
} {
  return {
    openAi: buildDemoProviderResult("openai", { topic, prompt, answers }),
    gemini: buildDemoProviderResult("gemini", { topic, prompt, answers })
  };
}

export function getDemoProviderResult(
  provider: "openai" | "gemini",
  context: {
    topic: string;
    prompt: string;
    answers: AnswerEntry[];
  }
): ProviderResult {
  return buildDemoProviderResult(provider, context);
}

export function buildDemoEmailPreview({
  to,
  subject,
  body,
  filename,
  pdfSize
}: {
  to: string;
  subject: string;
  body: string;
  filename: string;
  pdfSize: number;
}): string {
  const sizeKb = Math.max(1, Math.round(pdfSize / 1024));
  return [
    `To: ${to}`,
    `Subject: ${subject}`,
    "",
    body,
    "",
    `Demo attachment: ${filename} (~${sizeKb} KB)`
  ].join("\n");
}
