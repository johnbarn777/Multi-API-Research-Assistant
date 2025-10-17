import type { Timestamp } from "firebase-admin/firestore";

export type ResearchStatus =
  | "awaiting_refinements"
  | "refining"
  | "ready_to_run"
  | "running"
  | "completed"
  | "failed";

export interface ProviderSource {
  title: string;
  url: string;
}

export interface ProviderMetadata {
  tokens?: number;
  model?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface ProviderResult {
  raw: unknown;
  summary: string;
  insights: string[];
  sources?: ProviderSource[];
  meta?: ProviderMetadata;
}

export type ProviderRunStatus = "idle" | "queued" | "running" | "success" | "failure";

export interface ResearchProviderState {
  sessionId?: string;
  jobId?: string;
  questions?: Array<{ index: number; text: string }>;
  answers?: Array<{ index: number; answer: string }>;
  finalPrompt?: string;
  result?: ProviderResult;
  durationMs?: number;
  status?: ProviderRunStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string | null;
}

export interface ResearchReportState {
  pdfPath?: string;
  emailedTo?: string;
  emailStatus?: "queued" | "sent" | "failed";
  emailError?: string | null;
}

export interface Research {
  id: string;
  ownerUid: string;
  title: string;
  status: ResearchStatus;
  dr: ResearchProviderState;
  gemini: ResearchProviderState;
  report: ResearchReportState;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface GmailOAuthTokens {
  access_token?: string;
  refresh_token?: string;
  expiry_date?: number;
  scope?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  gmail_oauth?: GmailOAuthTokens;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
