import Link from "next/link";

export type ResearchCardProps = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
};

export function ResearchCard({ id, title, status, createdAt }: ResearchCardProps) {
  return (
    <Link
      href={`/research/${id}`}
      className="group flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/50 p-5 transition hover:border-brand hover:bg-slate-900/80"
    >
      <div>
        <h3 className="text-lg font-semibold text-white group-hover:text-brand">{title}</h3>
        <p className="text-xs text-slate-500">
          Created at {new Date(createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        </p>
      </div>
      <span className="inline-flex w-fit items-center rounded-full border border-slate-700 px-3 py-1 text-xs uppercase tracking-wide text-slate-300">
        {status}
      </span>
    </Link>
  );
}
