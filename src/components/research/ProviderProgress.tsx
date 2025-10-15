type ProviderProgressProps = {
  provider: "openai" | "gemini";
  status: "queued" | "running" | "success" | "failure";
  lastUpdated?: string;
  summary?: string;
};

const statusStyles: Record<ProviderProgressProps["status"], string> = {
  queued: "border-slate-700 text-slate-400",
  running: "border-amber-500 text-amber-400",
  success: "border-emerald-500 text-emerald-400",
  failure: "border-rose-500 text-rose-400"
};

export function ProviderProgress({ provider, status, lastUpdated, summary }: ProviderProgressProps) {
  const providerName = provider === "openai" ? "OpenAI Deep Research" : "Google Gemini";

  return (
    <article className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/40 p-5">
      <header className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">{providerName}</h3>
        <span className={`rounded-full border px-3 py-1 text-xs uppercase tracking-wide ${statusStyles[status]}`}>
          {status}
        </span>
      </header>
      <p className="text-sm text-slate-400">
        {summary ??
          "Provider execution details will render here once integration is available. Include tokens, duration, and links."}
      </p>
      {lastUpdated ? (
        <p className="text-xs text-slate-500">
          Last updated {new Date(lastUpdated).toLocaleString(undefined, { timeStyle: "short" })}
        </p>
      ) : null}
    </article>
  );
}
