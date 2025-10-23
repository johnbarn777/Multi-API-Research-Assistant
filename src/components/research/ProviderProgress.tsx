import type { ResearchProviderState, ProviderRunStatus } from "@/types/research";

type ProviderProgressProps = {
  provider: "openai" | "gemini";
  state?: ResearchProviderState;
  onRetry?: () => void;
  isRetrying?: boolean;
  retryError?: string | null;
  retrySuccess?: string | null;
  disabled?: boolean;
};

type StatusToken = ProviderRunStatus | "queued" | "unknown";

const statusLabels: Record<StatusToken, string> = {
  idle: "Idle",
  queued: "Queued",
  running: "Running",
  success: "Success",
  failure: "Failure",
  unknown: "Pending"
};

const statusStyles: Record<StatusToken, string> = {
  idle: "border-slate-700 text-slate-400",
  queued: "border-slate-700 text-slate-400",
  running: "border-amber-500 text-amber-400",
  success: "border-emerald-500 text-emerald-400",
  failure: "border-rose-500 text-rose-400",
  unknown: "border-slate-700 text-slate-400"
};

function formatSummary(provider: "openai" | "gemini", state?: ResearchProviderState): string {
  const status: ProviderRunStatus | undefined = state?.status;

  if (status === "success") {
    const summary = state?.result?.summary?.trim();
    if (summary) {
      return summary;
    }
    return "Provider run completed successfully. No summary was returned.";
  }

  if (status === "failure") {
    return state?.error ?? "Provider run failed. Check the logs for details.";
  }

  if (status === "running") {
    return "Execution in progress. This may take a couple of minutes depending on provider load.";
  }

  if (status === "queued" || status === "idle") {
    return "Awaiting execution. Start the run once the refined prompt is ready.";
  }

  return provider === "openai"
    ? "OpenAI Deep Research results will appear here after the run starts."
    : "Gemini results will appear here after the run starts.";
}

function formatDuration(durationMs: number | undefined): string | null {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs <= 0) {
    return null;
  }

  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  const seconds = durationMs / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

function formatTimestamp(timestamp: string | undefined): string | null {
  if (!timestamp) {
    return null;
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short"
  });
}

function buildMeta(state?: ResearchProviderState): string | null {
  if (!state) {
    return null;
  }

  const parts: string[] = [];
  const duration = formatDuration(state.durationMs);
  if (duration) {
    parts.push(`Duration ${duration}`);
  }

  const tokens = state.result?.meta?.tokens;
  if (typeof tokens === "number" && tokens > 0) {
    parts.push(`Tokens ${tokens}`);
  }

  const model = state.result?.meta?.model;
  if (typeof model === "string" && model.trim().length > 0) {
    parts.push(model.trim());
  }

  return parts.length > 0 ? parts.join(" • ") : null;
}

export function ProviderProgress({
  provider,
  state,
  onRetry,
  isRetrying = false,
  retryError,
  retrySuccess,
  disabled = false
}: ProviderProgressProps) {
  const providerName = provider === "openai" ? "OpenAI Deep Research" : "Google Gemini";
  const status = (state?.status ?? "unknown") as StatusToken;
  const statusLabel = statusLabels[status] ?? statusLabels.unknown;
  const badgeClass = statusStyles[status] ?? statusStyles.unknown;
  const summary = formatSummary(provider, state);
  const meta = buildMeta(state);
  const lastUpdated = formatTimestamp(state?.completedAt ?? state?.startedAt);
  const isProviderRunning = state?.status === "running";
  const hasAttempted = Boolean(state) && state?.status !== "idle" && state?.status !== "queued";
  const showRetryButton = typeof onRetry === "function" && hasAttempted && !isProviderRunning;
  const helperMessage = retryError ?? retrySuccess ?? null;
  const retryDisabled = disabled || isRetrying || isProviderRunning;
  const helperClass = retryError ? "text-rose-300" : "text-emerald-300";

  return (
    <article className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/40 p-5">
      <header className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">{providerName}</h3>
        <span className={`rounded-full border px-3 py-1 text-xs uppercase tracking-wide ${badgeClass}`}>
          {statusLabel}
        </span>
      </header>
      <p className="text-sm text-slate-400 whitespace-pre-line">{summary}</p>
      {meta ? <p className="text-xs text-slate-500">{meta}</p> : null}
      {lastUpdated ? <p className="text-xs text-slate-500">Last update {lastUpdated}</p> : null}
      {showRetryButton ? (
        <div className="flex flex-col gap-2 pt-1">
          <button
            type="button"
            onClick={onRetry}
            disabled={retryDisabled}
            className="inline-flex w-fit items-center rounded-md border border-slate-600 px-3 py-1 text-xs font-medium text-slate-100 transition hover:bg-slate-800/70 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRetrying ? "Retrying…" : `Retry ${providerName}`}
          </button>
          {helperMessage ? (
            <p className={`text-xs ${helperClass}`}>{helperMessage}</p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
