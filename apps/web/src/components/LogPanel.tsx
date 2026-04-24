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
  clearShortcut: string;
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
  clearShortcut,
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
  const connectionLabel = `${host.username}@${host.host}:${host.port}`;

  return (
    <section className="panel flex min-h-0 flex-1 flex-col overflow-hidden" data-ui="logs-panel">
      <div className="border-b border-[color:var(--border)] px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button
              aria-label="Back to processes"
              className="button-ghost h-7 w-7 p-0"
              onClick={onBackToProcesses}
              title="Back to processes"
              type="button"
            >
              <ArrowLeft className="size-4" />
            </button>
            <div className="min-w-0 flex flex-1 flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="truncate text-sm font-semibold leading-5 text-[color:var(--text)]">
                {host.name} / {title}
              </h3>
              <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface-soft)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-[color:var(--text-soft)]">
                {status}
              </span>
              <span className="max-w-full truncate text-[11px] text-[color:var(--text-soft)]" title={connectionLabel}>
                {connectionLabel}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <button
              aria-pressed={scrollLock}
              className={`${scrollLock ? "button-primary" : "button-secondary"} h-8 px-2.5 py-1 text-xs`}
              onClick={onScrollLockToggle}
              type="button"
            >
              <ScrollText className="mr-1.5 size-3.5" />
              {scrollLock ? "Locked" : "Lock"}
            </button>
            <button className="button-secondary h-8 px-2.5 py-1 text-xs" onClick={onPauseToggle} type="button">
              {paused ? <Play className="mr-1.5 size-3.5" /> : <Pause className="mr-1.5 size-3.5" />}
              {paused ? "Resume" : "Pause"}
            </button>
            <button
              className="button-secondary h-8 px-2.5 py-1 text-xs"
              onClick={onClear}
              title={`Clear logs (${clearShortcut})`}
              type="button"
            >
              <RotateCcw className="mr-1.5 size-3.5" />
              Clear
            </button>
            <button className="button-secondary h-8 px-2.5 py-1 text-xs" onClick={onDownload} type="button">
              <Download className="mr-1.5 size-3.5" />
              Download
            </button>
            <button className="button-primary h-8 px-2.5 py-1 text-xs" onClick={onRestart} type="button">
              Restart
            </button>
            <CollapseToggleButton collapsed={collapsed} onClick={onToggleCollapsed} />
          </div>
        </div>

        {!collapsed ? (
        <div className="mt-2 grid gap-1.5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_6.5rem]">
          <label className="space-y-0.5 text-[11px] text-[color:var(--text-muted)]">
            <span>Include</span>
            <input
              className="field h-8 px-2.5 py-1 text-xs"
              onChange={(event) => onIncludePatternChange(event.target.value)}
              placeholder="regex"
              value={includePattern}
            />
          </label>
          <label className="space-y-0.5 text-[11px] text-[color:var(--text-muted)]">
            <span>Exclude</span>
            <input
              className="field h-8 px-2.5 py-1 text-xs"
              onChange={(event) => onExcludePatternChange(event.target.value)}
              placeholder="regex"
              value={excludePattern}
            />
          </label>
          <label className="space-y-0.5 text-[11px] text-[color:var(--text-muted)]">
            <span>Tail</span>
            <input
              className="field h-8 px-2.5 py-1 text-xs"
              min={10}
              onChange={(event) => onInitialLinesChange(Number(event.target.value) || 200)}
              type="number"
              value={initialLines}
            />
          </label>
        </div>
        ) : null}

        {!collapsed ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="badge px-1.5 py-0.5">
            <ScrollText className="size-3.5" />
            {lines.length} visible
          </span>
          <span className="badge px-1.5 py-0.5">{bufferedLineCount} buffered</span>
          {processes.map((process) => (
            <span className="badge px-1.5 py-0.5" key={process.pmId}>
              {process.name}
            </span>
          ))}
          {filterError ? (
            <span className="flash px-2 py-1 text-[11px]" data-tone="error">
              {filterError}
            </span>
          ) : null}
          {streamError ? (
            <span className="flash px-2 py-1 text-[11px]" data-tone="error">
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
