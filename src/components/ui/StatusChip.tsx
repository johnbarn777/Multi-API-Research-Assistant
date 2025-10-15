type StatusChipProps = {
  label: string;
};

export function StatusChip({ label }: StatusChipProps) {
  return (
    <span className="inline-flex items-center justify-center rounded-full border border-slate-700 px-3 py-1 text-xs uppercase tracking-wide text-slate-300">
      {label}
    </span>
  );
}
