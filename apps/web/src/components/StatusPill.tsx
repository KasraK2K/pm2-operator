import { Activity, AlertTriangle, HelpCircle, Pause } from "lucide-react";

interface StatusPillProps {
  status: string;
  compact?: boolean;
}

function statusTone(status: string) {
  if (status === "online") {
    return "border-transparent bg-[color:var(--success-soft)] text-[color:var(--success)]";
  }

  if (status === "stopped") {
    return "border-transparent bg-[color:var(--warning-soft)] text-[color:var(--warning)]";
  }

  if (status === "errored") {
    return "border-transparent bg-[color:var(--danger-soft)] text-[color:var(--danger)]";
  }

  return "border-[color:var(--border)] bg-[color:var(--surface-soft)] text-[color:var(--text-muted)]";
}

function statusIcon(status: string) {
  if (status === "online") {
    return Activity;
  }

  if (status === "stopped") {
    return Pause;
  }

  if (status === "errored") {
    return AlertTriangle;
  }

  return HelpCircle;
}

export function StatusPill({ status, compact = false }: StatusPillProps) {
  const Icon = statusIcon(status);

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border font-medium leading-none ${compact ? "gap-1 px-2 py-0.5 text-[10px]" : "gap-1.5 px-2 py-1 text-[11px]"} ${statusTone(status)}`}
    >
      <Icon className={`${compact ? "size-3" : "size-3.5"} shrink-0`} />
      <span>{status}</span>
    </span>
  );
}
