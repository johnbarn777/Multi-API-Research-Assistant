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
