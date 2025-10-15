import type { ProviderResult } from "./providers";

export interface GmailOAuthTokens {
  access_token?: string;
  refresh_token?: string;
  expiry_date?: number;
  scope?: string;
}

export interface UserDocument {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  gmail_oauth?: GmailOAuthTokens;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface ResearchProviderState {
  sessionId?: string;
  jobId?: string;
  questions?: Array<{ index: number; text: string }>;
  answers?: Array<{ index: number; answer: string }>;
  finalPrompt?: string;
  result?: ProviderResult;
  durationMs?: number;
}

export interface ResearchReportState {
  pdfPath?: string;
  emailedTo?: string;
  emailStatus?: "queued" | "sent" | "failed";
}

export interface ResearchDocument {
  id: string;
  ownerUid: string;
  title: string;
  status:
    | "awaiting_refinements"
    | "refining"
    | "ready_to_run"
    | "running"
    | "completed"
    | "failed";
  dr: ResearchProviderState;
  gemini: ResearchProviderState;
  report: ResearchReportState;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}
