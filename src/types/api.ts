import type {
  ResearchProviderState,
  ResearchReportState,
  ResearchStatus
} from "@/types/research";

export interface ResearchListItem {
  id: string;
  ownerUid: string;
  title: string;
  status: ResearchStatus;
  dr: ResearchProviderState;
  gemini: ResearchProviderState;
  report: ResearchReportState;
  createdAt: string;
  updatedAt: string;
}

export interface ListResearchResponse {
  items: ResearchListItem[];
  nextCursor: string | null;
}

export interface ResearchResponse {
  item: ResearchListItem;
}
