import { ArrowLeft, Download, Pause, Play, RotateCcw, ScrollText } from "lucide-react";
import { useEffect, useRef } from "react";

import { CollapseToggleButton } from "./CollapseToggleButton";
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
  bufferedLineCount: number;
  collapsed: boolean;
  onPauseToggle: () => void;
  onScrollLockToggle: () => void;
  onClear: () => void;
  onDownload: () => void;
  onIncludePatternChange: (value: string) => void;
  onExcludePatternChange: (value: string) => void;
  onInitialLinesChange: (value: number) => void;
  onBackToProcesses: () => void;
  onRestart: () => void;
  onToggleCollapsed: () => void;
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
  bufferedLineCount,
  collapsed,
  onPauseToggle,
  onScrollLockToggle,
  onClear,
  onDownload,
  onIncludePatternChange,
  onExcludePatternChange,
  onInitialLinesChange,
  onBackToProcesses,
  onRestart,
  onToggleCollapsed
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
      <section className="panel flex min-h-0 flex-1 items-center justify-center px-6 py-8 text-center" data-ui="logs-empty-state">
        <div className="max-w-sm space-y-2">
          <div className="section-kicker">Live logs</div>
          <div className="text-base font-semibold text-[color:var(--text)]">Select processes to stream.</div>
        </div>
      </section>
    );
  }

  const title = processes.length === 1 ? processes[0].name : `${processes.length} selected processes`;

  return (
    <section className="panel flex min-h-0 flex-1 flex-col overflow-hidden" data-ui="logs-panel">
      <div className="border-b border-[color:var(--border)] px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <button
              aria-label="Back to processes"
              className="button-ghost h-8 w-8 p-0"
              onClick={onBackToProcesses}
              title="Back to processes"
              type="button"
            >
              <ArrowLeft className="size-4" />
            </button>
            <div className="min-w-0">
              <div className="section-kicker">{status}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h3 className="truncate text-base font-semibold text-[color:var(--text)]">
                  {host.name} / {title}
                </h3>
              </div>
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-[color:var(--text-soft)]">
                <span>{host.username}@{host.host}:{host.port}</span>
              </div>
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
            <CollapseToggleButton collapsed={collapsed} onClick={onToggleCollapsed} />
          </div>
        </div>

        {!collapsed ? (
        <div className="mt-3 grid gap-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem]">
          <label className="space-y-1 text-xs text-[color:var(--text-muted)]">
            <span>Include regex</span>
            <input
              className="field"
              onChange={(event) => onIncludePatternChange(event.target.value)}
              placeholder="regex"
              value={includePattern}
            />
          </label>
          <label className="space-y-1 text-xs text-[color:var(--text-muted)]">
            <span>Exclude regex</span>
            <input
              className="field"
              onChange={(event) => onExcludePatternChange(event.target.value)}
              placeholder="regex"
              value={excludePattern}
            />
          </label>
          <label className="space-y-1 text-xs text-[color:var(--text-muted)]">
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
        ) : null}

        {!collapsed ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="badge">
            <ScrollText className="size-3.5" />
            {lines.length} visible
          </span>
          <span className="badge">{bufferedLineCount} buffered</span>
          <button className="button-ghost px-2 py-1 text-xs" onClick={onScrollLockToggle} type="button">
            {scrollLock ? "Unlock scroll" : "Lock scroll"}
          </button>
          {processes.map((process) => (
            <span className="badge" key={process.pmId}>
              {process.name}
            </span>
          ))}
          {filterError ? (
            <span className="flash py-1.5 text-xs" data-tone="error">
              {filterError}
            </span>
          ) : null}
          {streamError ? (
            <span className="flash py-1.5 text-xs" data-tone="error">
              {streamError}
            </span>
          ) : null}
        </div>
        ) : null}
      </div>

      {!collapsed ? (
      <div
        className="terminal-shell font-mono-ui flex-1 overflow-auto px-3 py-3 text-[12px] leading-6 sm:text-[12.5px]"
        data-ui="logs-viewport"
        ref={viewportRef}
      >
        {lines.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-[color:var(--terminal-muted)]">
            Waiting...
          </div>
        ) : (
          <div className="space-y-1">
            {lines.map((entry) => (
              <div className="log-row" data-process-key={entry.processKey} data-source={entry.source} data-ui="log-line" key={entry.sequence}>
                <div className="grid gap-1 text-[11px] text-[color:var(--terminal-muted)] md:grid-cols-[6rem_minmax(8rem,11rem)_1fr] md:gap-3">
                  <span>{formatTimestamp(entry.timestamp)}</span>
                  <span className="truncate">{entry.processLabel}</span>
                  <span className="break-all whitespace-pre-wrap text-[color:var(--terminal-text)]">
                    {entry.source === "stderr" ? "[stderr] " : ""}
                    {entry.line}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      ) : null}
    </section>
  );
}
