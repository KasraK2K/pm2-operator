import { Download, Pause, Play, RotateCcw, ScrollText } from "lucide-react";
import { useEffect, useRef } from "react";

import { formatTimestamp } from "../lib/format";
import type { Host, LogLine, Pm2Process } from "../lib/types";

interface LogPanelProps {
  host: Host | null;
  processes: Pm2Process[];
  lines: LogLine[];
  paused: boolean;
  scrollLock: boolean;
  includePattern: string;
  excludePattern: string;
  filterError: string | null;
  status: string;
  streamError: string | null;
  initialLines: number;
  onPauseToggle: () => void;
  onScrollLockToggle: () => void;
  onClear: () => void;
  onDownload: () => void;
  onIncludePatternChange: (value: string) => void;
  onExcludePatternChange: (value: string) => void;
  onInitialLinesChange: (value: number) => void;
  onRestart: () => void;
}

export function LogPanel({
  host,
  processes,
  lines,
  paused,
  scrollLock,
  includePattern,
  excludePattern,
  filterError,
  status,
  streamError,
  initialLines,
  onPauseToggle,
  onScrollLockToggle,
  onClear,
  onDownload,
  onIncludePatternChange,
  onExcludePatternChange,
  onInitialLinesChange,
  onRestart
}: LogPanelProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollLock || paused) {
      return;
    }

    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    viewport.scrollTop = viewport.scrollHeight;
  }, [lines, paused, scrollLock]);

  if (!host || processes.length === 0) {
    return (
      <div className="panel flex min-h-[32rem] items-center justify-center p-8 text-center text-slate-400">
        Select a host and choose one or more processes from the Processes tab to begin streaming logs.
      </div>
    );
  }

  const title = processes.length === 1 ? processes[0].name : `${processes.length} selected processes`;

  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-white/10 px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-sky-200">
              <ScrollText className="size-4" />
              Live logs
            </div>
            <h3 className="mt-3 text-2xl font-semibold text-white">
              {host.name} / {title}
            </h3>
            <p className="mt-2 text-sm text-slate-400">
              Host fingerprint {host.hostFingerprint ?? "not pinned yet"} | status {status}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {processes.map((process) => (
                <span
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300"
                  key={process.pmId}
                >
                  {process.name}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="button-secondary" onClick={onPauseToggle} type="button">
              {paused ? <Play className="mr-2 size-4" /> : <Pause className="mr-2 size-4" />}
              {paused ? "Resume" : "Pause"}
            </button>
            <button className="button-secondary" onClick={onClear} type="button">
              <RotateCcw className="mr-2 size-4" />
              Clear
            </button>
            <button className="button-secondary" onClick={onDownload} type="button">
              <Download className="mr-2 size-4" />
              Download
            </button>
            <button className="button-primary" onClick={onRestart} type="button">
              Restart stream
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 border-b border-white/10 px-6 py-4 lg:grid-cols-[1fr_1fr_auto]">
        <label className="space-y-2 text-sm text-slate-300">
          <span>Include regex</span>
          <input
            className="field"
            onChange={(event) => onIncludePatternChange(event.target.value)}
            placeholder="Optional"
            value={includePattern}
          />
        </label>
        <label className="space-y-2 text-sm text-slate-300">
          <span>Exclude regex</span>
          <input
            className="field"
            onChange={(event) => onExcludePatternChange(event.target.value)}
            placeholder="Optional"
            value={excludePattern}
          />
        </label>
        <label className="space-y-2 text-sm text-slate-300">
          <span>Tail lines</span>
          <input
            className="field"
            min={10}
            onChange={(event) => onInitialLinesChange(Number(event.target.value) || 200)}
            type="number"
            value={initialLines}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 text-sm text-slate-400">
        <div className="flex flex-wrap items-center gap-4">
          <span>{lines.length} visible lines</span>
          <button className="button-ghost" onClick={onScrollLockToggle} type="button">
            {scrollLock ? "Unlock scroll" : "Lock scroll"}
          </button>
        </div>
        {filterError ? (
          <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-amber-200">
            {filterError}
          </span>
        ) : null}
        {streamError ? (
          <span className="rounded-full border border-rose-400/20 bg-rose-400/10 px-3 py-1 text-rose-200">
            {streamError}
          </span>
        ) : null}
      </div>

      <div
        className="font-mono-ui h-[32rem] overflow-auto bg-slate-950/70 px-4 py-4 text-[13px] text-slate-200"
        ref={viewportRef}
      >
        {lines.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-slate-500">
            Waiting for log output...
          </div>
        ) : (
          <div className="space-y-1">
            {lines.map((entry) => (
              <div
                className={`grid grid-cols-[6.25rem_5rem_12rem_1fr] gap-3 rounded-xl px-3 py-2 ${
                  entry.source === "stderr" ? "bg-rose-400/5 text-rose-100" : "bg-white/[0.02]"
                }`}
                key={entry.sequence}
              >
                <span className="text-slate-500">{formatTimestamp(entry.timestamp)}</span>
                <span className="uppercase tracking-[0.18em] text-slate-500">{entry.source}</span>
                <span className="truncate text-slate-400">{entry.processLabel}</span>
                <span className="break-all whitespace-pre-wrap">{entry.line}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
