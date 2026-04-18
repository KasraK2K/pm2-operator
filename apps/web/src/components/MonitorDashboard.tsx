import {
  Activity,
  AlertTriangle,
  BarChart3,
  Cpu,
  HardDrive,
  LineChart,
  RefreshCw,
  RotateCcw,
  Server,
  TerminalSquare,
  Zap
} from "lucide-react";

import { CollapseToggleButton } from "./CollapseToggleButton";
import { StatusPill } from "./StatusPill";
import {
  formatBytes,
  formatHostOs,
  formatLoadAverage,
  formatPercent,
  formatTimestamp,
  formatUptime
} from "../lib/format";
import type {
  Host,
  LogLine,
  Pm2DashboardAction,
  Pm2DashboardProcessState,
  Pm2DashboardSnapshot,
  Pm2Process
} from "../lib/types";

export interface DashboardHistorySample {
  timestamp: string;
  totalCpu: number;
  totalMemory: number;
}

interface MonitorDashboardProps {
  host: Host | null;
  activeTargets: Pm2Process[];
  snapshot: Pm2DashboardSnapshot | null;
  history: DashboardHistorySample[];
  dashboardStatus: string;
  dashboardError: string | null;
  logStatus: string;
  logError: string | null;
  logLines: LogLine[];
  canManageActions: boolean;
  actionBusyLabel: string | null;
  isPanelCollapsed: (panelId: string) => boolean;
  onAction: (action: Pm2DashboardAction, processIds: number[]) => void;
  onOpenLogs: () => void;
  onRefresh: () => void;
  onTogglePanel: (panelId: string) => void;
}

function buildTrendPath(values: number[], width: number, height: number) {
  if (values.length === 0) {
    return "";
  }

  if (values.length === 1) {
    const y = height / 2;
    return `M 0 ${y} L ${width} ${y}`;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

function TrendChart({
  title,
  accent,
  samples,
  valueFormatter
}: {
  title: string;
  accent: string;
  samples: Array<{ timestamp: string; value: number }>;
  valueFormatter: (value: number) => string;
}) {
  const values = samples.map((sample) => sample.value);
  const path = buildTrendPath(values, 320, 112);
  const latest = values.at(-1) ?? 0;

  return (
    <div className="panel-soft p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="section-kicker">{title}</div>
          <div className="mt-1 text-lg font-semibold text-[color:var(--text)]">
            {valueFormatter(latest)}
          </div>
        </div>
        <LineChart className="size-4 text-[color:var(--text-soft)]" />
      </div>

      <div className="mt-3">
        {samples.length <= 1 ? (
          <div className="flex h-28 items-center justify-center text-xs text-[color:var(--text-muted)]">
            Waiting for live samples...
          </div>
        ) : (
          <svg className="h-28 w-full" preserveAspectRatio="none" viewBox="0 0 320 112">
            <defs>
              <linearGradient id={`gradient-${title.replace(/\s+/g, "-")}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={accent} stopOpacity="0.28" />
                <stop offset="100%" stopColor={accent} stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <path
              d={`${path} L 320 112 L 0 112 Z`}
              fill={`url(#gradient-${title.replace(/\s+/g, "-")})`}
              opacity="0.8"
            />
            <path d={path} fill="none" stroke={accent} strokeLinecap="round" strokeWidth="3" />
          </svg>
        )}
      </div>

      {samples.length > 0 ? (
        <div className="mt-2 flex items-center justify-between text-[11px] text-[color:var(--text-soft)]">
          <span>{formatTimestamp(samples[0].timestamp)}</span>
          <span>{formatTimestamp(samples.at(-1)?.timestamp ?? samples[0].timestamp)}</span>
        </div>
      ) : null}
    </div>
  );
}

function CurrentBarChart({
  title,
  processes,
  selector,
  formatter,
  accent
}: {
  title: string;
  processes: Pm2DashboardProcessState[];
  selector: (process: Pm2DashboardProcessState) => number;
  formatter: (value: number) => string;
  accent: string;
}) {
  const maxValue = Math.max(1, ...processes.map(selector));

  return (
    <div className="panel-soft p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="section-kicker">{title}</div>
          <div className="mt-1 text-sm text-[color:var(--text-muted)]">
            Current comparison across selected PM2 processes
          </div>
        </div>
        <BarChart3 className="size-4 text-[color:var(--text-soft)]" />
      </div>

      <div className="mt-3 space-y-2">
        {processes.length === 0 ? (
          <div className="text-xs text-[color:var(--text-muted)]">No process samples available yet.</div>
        ) : (
          processes.map((process) => {
            const value = selector(process);
            const width = `${Math.max(6, (value / maxValue) * 100)}%`;

            return (
              <div key={`${title}-${process.pmId}`} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-[color:var(--text)]">{process.name}</span>
                  <span className="text-[color:var(--text-muted)]">{formatter(value)}</span>
                </div>
                <div className="h-2 rounded-full bg-[color:var(--surface-soft)]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width,
                      background: accent
                    }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function HeatmapGrid({ processes }: { processes: Pm2DashboardProcessState[] }) {
  const maxCpu = Math.max(1, ...processes.map((process) => process.cpu));
  const maxMemory = Math.max(1, ...processes.map((process) => process.memory));

  return (
    <div className="panel-soft p-3">
      <div className="section-kicker">Load heatmap</div>
      <div className="mt-1 text-sm text-[color:var(--text-muted)]">
        CPU and memory intensity across the selected PM2 processes
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {processes.length === 0 ? (
          <div className="text-xs text-[color:var(--text-muted)]">No process samples available yet.</div>
        ) : (
          processes.map((process) => {
            const cpuRatio = process.cpu / maxCpu;
            const memoryRatio = process.memory / maxMemory;
            const overlay = Math.max(cpuRatio, memoryRatio);

            return (
              <div
                className="rounded-[0.9rem] border border-[color:var(--border)] p-3"
                key={`heat-${process.pmId}`}
                style={{
                  background: `linear-gradient(135deg, rgba(90, 208, 255, ${0.08 + overlay * 0.2}), rgba(66, 216, 143, ${0.04 + overlay * 0.14}))`
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-[color:var(--text)]">{process.name}</div>
                    <div className="mt-1 text-[11px] text-[color:var(--text-soft)]">PM2 ID {process.pmId}</div>
                  </div>
                  <StatusPill compact status={process.status} />
                </div>
                <div className="mt-3 grid gap-2 text-xs text-[color:var(--text-muted)] sm:grid-cols-2">
                  <div>
                    <div>CPU</div>
                    <div className="mt-1 text-sm font-semibold text-[color:var(--text)]">
                      {formatPercent(process.cpu)}
                    </div>
                  </div>
                  <div>
                    <div>Memory</div>
                    <div className="mt-1 text-sm font-semibold text-[color:var(--text)]">
                      {formatBytes(process.memory)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function EmbeddedLogPanel({
  lines,
  status,
  error,
  onOpenLogs,
  onToggleCollapsed
}: {
  lines: LogLine[];
  status: string;
  error: string | null;
  onOpenLogs: () => void;
  onToggleCollapsed: () => void;
}) {
  const visibleLines = lines.slice(-80);

  return (
    <div className="panel-soft flex min-h-[20rem] flex-col overflow-hidden" data-ui="embedded-log-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--border)] px-3 py-2">
        <div>
          <div className="section-kicker">Embedded logs</div>
          <div className="mt-1 text-sm text-[color:var(--text-muted)]">
            {visibleLines.length} recent lines, stream {status}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <CollapseToggleButton collapsed={false} onClick={onToggleCollapsed} />
          <button className="button-secondary" onClick={onOpenLogs} type="button">
            <TerminalSquare className="mr-2 size-4" />
            Open full logs
          </button>
        </div>
      </div>

      {error ? (
        <div className="px-3 pt-3">
          <div className="flash" data-tone="error">
            {error}
          </div>
        </div>
      ) : null}

      <div className="terminal-shell min-h-0 flex-1 overflow-auto px-3 py-3 font-mono-ui text-[12px] leading-6">
        {visibleLines.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-[color:var(--terminal-muted)]">
            Waiting for log output...
          </div>
        ) : (
          <div className="space-y-1">
            {visibleLines.map((entry) => (
              <div className="log-row" data-source={entry.source} key={`embedded-${entry.sequence}`}>
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
    </div>
  );
}

export function MonitorDashboard({
  host,
  activeTargets,
  snapshot,
  history,
  dashboardStatus,
  dashboardError,
  logStatus,
  logError,
  logLines,
  canManageActions,
  actionBusyLabel,
  isPanelCollapsed,
  onAction,
  onOpenLogs,
  onRefresh,
  onTogglePanel
}: MonitorDashboardProps) {
  if (!host || activeTargets.length === 0) {
    return (
      <section className="panel flex min-h-0 flex-1 items-center justify-center px-6 py-8 text-center">
        <div className="max-w-2xl space-y-3">
          <div className="section-kicker">PM2 dashboard</div>
          <div className="text-lg font-semibold text-[color:var(--text)]">
            Open one or more PM2 processes to launch the monitoring dashboard.
          </div>
          <p className="text-sm leading-6 text-[color:var(--text-muted)]">
            This view combines live KPIs, trend charts, process metadata, safe PM2 controls, and an
            embedded log feed for the currently selected services.
          </p>
        </div>
      </section>
    );
  }

  const processes = snapshot?.processes ?? [];
  const aggregate = snapshot?.aggregate;
  const cpuSamples = history.map((sample) => ({
    timestamp: sample.timestamp,
    value: sample.totalCpu
  }));
  const memorySamples = history.map((sample) => ({
    timestamp: sample.timestamp,
    value: sample.totalMemory
  }));
  const missingTargetPmIds = snapshot?.selection.missingTargetPmIds ?? [];
  const headerTargets = activeTargets.map((target) => {
    const liveProcess = processes.find((process) => process.pmId === target.pmId);

    return {
      pmId: target.pmId,
      name: liveProcess?.selectedLabel ?? liveProcess?.name ?? target.name,
      status: liveProcess?.status ?? target.status ?? "unknown"
    };
  });

  return (
    <section className="min-h-0 flex-1 space-y-3 overflow-auto pr-1" data-ui="monitor-dashboard">
      <div className="panel px-4 py-3" data-ui="dashboard-header">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="section-kicker">Dashboard</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-semibold text-[color:var(--text)]">
                {host.name} monitoring dashboard
              </h3>
              <span className="badge">{dashboardStatus}</span>
              <span className="badge">{activeTargets.length} target{activeTargets.length === 1 ? "" : "s"}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-[color:var(--text-muted)]">
              <span>
                {host.username}@{host.host}:{host.port}
              </span>
              <span className="max-w-[28rem] truncate" title={host.hostFingerprint ?? ""}>
                Fingerprint {host.hostFingerprint ?? "not pinned"}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <CollapseToggleButton
              collapsed={isPanelCollapsed("dashboard-header")}
              onClick={() => onTogglePanel("dashboard-header")}
            />
            <button className="button-secondary" onClick={onRefresh} type="button">
              <RefreshCw className="mr-2 size-4" />
              Refresh dashboard
            </button>
            {canManageActions ? (
              <>
                <button
                  className="button-secondary"
                  disabled={processes.length === 0 || !!actionBusyLabel}
                  onClick={() => onAction("reload", processes.map((process) => process.pmId))}
                  type="button"
                >
                  <Zap className="mr-2 size-4" />
                  Reload selected
                </button>
                <button
                  className="button-primary"
                  disabled={processes.length === 0 || !!actionBusyLabel}
                  onClick={() => onAction("restart", processes.map((process) => process.pmId))}
                  type="button"
                >
                  <RotateCcw className="mr-2 size-4" />
                  Restart selected
                </button>
              </>
            ) : null}
          </div>
        </div>

        {!isPanelCollapsed("dashboard-header") ? (
          <>
        <div className="mt-3 flex flex-wrap items-start gap-2">
          {headerTargets.map((target) => (
            <div
              className="inline-flex max-w-full items-center gap-2 rounded-[0.9rem] border border-[color:var(--border)] bg-[color:var(--surface-soft)] px-2.5 py-1.5"
              key={`target-${target.pmId}`}
              title={`${target.name} (${target.status})`}
            >
              <span className="max-w-[18rem] truncate text-xs font-medium text-[color:var(--text)]">
                {target.name}
              </span>
              <StatusPill compact status={target.status} />
            </div>
          ))}
        </div>

        {actionBusyLabel ? (
          <div className="mt-3 flash" data-tone="info">
            {actionBusyLabel}
          </div>
        ) : null}

        {dashboardError ? (
          <div className="mt-3 flash" data-tone="error">
            {dashboardError}
          </div>
        ) : null}

        {missingTargetPmIds.length > 0 ? (
          <div className="mt-3 flash" data-tone="info">
            Some selected PM2 processes are no longer available on this host: {missingTargetPmIds.join(", ")}.
          </div>
        ) : null}
          </>
        ) : null}
      </div>

      <div className="panel p-3" data-ui="dashboard-kpi-strip">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="section-kicker">KPIs</div>
            <div className="mt-1 text-sm text-[color:var(--text-muted)]">
              Live aggregate health for the current PM2 target set.
            </div>
          </div>
          <CollapseToggleButton
            collapsed={isPanelCollapsed("dashboard-kpi-strip")}
            onClick={() => onTogglePanel("dashboard-kpi-strip")}
          />
        </div>

        {!isPanelCollapsed("dashboard-kpi-strip") ? (
        <div className="mt-3 grid gap-3 xl:grid-cols-5">
        <div className="panel-soft p-3" data-ui="dashboard-kpi-total-cpu">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="section-kicker">Total CPU</div>
              <div className="mt-1 text-xl font-semibold text-[color:var(--text)]">
                {formatPercent(aggregate?.totalCpu ?? 0)}
              </div>
            </div>
            <Cpu className="size-4 text-[color:var(--accent)]" />
          </div>
        </div>
        <div className="panel-soft p-3" data-ui="dashboard-kpi-total-memory">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="section-kicker">Total memory</div>
              <div className="mt-1 text-xl font-semibold text-[color:var(--text)]">
                {formatBytes(aggregate?.totalMemory ?? 0)}
              </div>
            </div>
            <HardDrive className="size-4 text-[color:var(--accent)]" />
          </div>
        </div>
        <div className="panel-soft p-3" data-ui="dashboard-kpi-process-count">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="section-kicker">Processes</div>
              <div className="mt-1 text-xl font-semibold text-[color:var(--text)]">
                {aggregate?.processCount ?? activeTargets.length}
              </div>
            </div>
            <Activity className="size-4 text-[color:var(--accent)]" />
          </div>
        </div>
        <div className="panel-soft p-3" data-ui="dashboard-kpi-status">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="section-kicker">Online / errored</div>
              <div className="mt-1 text-xl font-semibold text-[color:var(--text)]">
                {aggregate?.onlineCount ?? 0} / {aggregate?.erroredCount ?? 0}
              </div>
            </div>
            <Server className="size-4 text-[color:var(--accent)]" />
          </div>
        </div>
        <div className="panel-soft p-3" data-ui="dashboard-kpi-restart-delta">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="section-kicker">Restart delta</div>
              <div className="mt-1 text-xl font-semibold text-[color:var(--text)]">
                {aggregate?.restartDelta ?? 0}
              </div>
            </div>
            <RotateCcw className="size-4 text-[color:var(--accent)]" />
          </div>
        </div>
      </div>
        ) : null}
      </div>

      <div className="panel p-3" data-ui="dashboard-runtime-section">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="section-kicker">Runtime summary</div>
            <div className="mt-1 text-sm text-[color:var(--text-muted)]">
              Host metadata with live aggregate CPU and memory history.
            </div>
          </div>
          <CollapseToggleButton
            collapsed={isPanelCollapsed("dashboard-runtime-section")}
            onClick={() => onTogglePanel("dashboard-runtime-section")}
          />
        </div>

        {!isPanelCollapsed("dashboard-runtime-section") ? (
      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        <div className="panel-soft p-3 xl:col-span-1" data-ui="dashboard-host-summary">
          <div className="section-kicker">Host summary</div>
          <div className="mt-1 text-sm text-[color:var(--text-muted)]">
            Live runtime context from the remote PM2 host
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-xs text-[color:var(--text-soft)]">Remote hostname</div>
              <div className="mt-1 text-sm font-medium text-[color:var(--text)]">
                {snapshot?.host?.hostname ?? "n/a"}
              </div>
            </div>
            <div>
              <div className="text-xs text-[color:var(--text-soft)]">PM2 version</div>
              <div className="mt-1 text-sm font-medium text-[color:var(--text)]">
                {snapshot?.host?.pm2Version ?? "n/a"}
              </div>
            </div>
            <div className="sm:col-span-2">
              <div className="text-xs text-[color:var(--text-soft)]">OS</div>
              <div
                className="mt-1 text-sm font-medium text-[color:var(--text)]"
                title={snapshot?.host?.os ?? ""}
              >
                {formatHostOs(snapshot?.host?.os ?? null)}
              </div>
            </div>
            <div>
              <div className="text-xs text-[color:var(--text-soft)]">CPU cores</div>
              <div className="mt-1 text-sm font-medium text-[color:var(--text)]">
                {snapshot?.host?.cpuCores ?? "n/a"}
              </div>
            </div>
            <div>
              <div className="text-xs text-[color:var(--text-soft)]">Host memory</div>
              <div className="mt-1 text-sm font-medium text-[color:var(--text)]">
                {snapshot?.host?.totalMemory ? formatBytes(snapshot.host.totalMemory) : "n/a"}
              </div>
            </div>
            <div className="sm:col-span-2">
              <div className="text-xs text-[color:var(--text-soft)]">Load average</div>
              <div className="mt-1 text-sm font-medium text-[color:var(--text)]">
                {formatLoadAverage(snapshot?.host?.loadAverage ?? [])}
              </div>
            </div>
          </div>
        </div>

        <TrendChart
          accent="var(--accent)"
          samples={cpuSamples}
          title="CPU trend"
          valueFormatter={formatPercent}
        />

        <TrendChart
          accent="var(--success)"
          samples={memorySamples}
          title="Memory trend"
          valueFormatter={formatBytes}
        />
      </div>
        ) : null}
      </div>

      <div className="panel p-3" data-ui="dashboard-comparison-section">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="section-kicker">Process comparisons</div>
            <div className="mt-1 text-sm text-[color:var(--text-muted)]">
              Compare current CPU and memory usage across selected PM2 services.
            </div>
          </div>
          <CollapseToggleButton
            collapsed={isPanelCollapsed("dashboard-comparison-section")}
            onClick={() => onTogglePanel("dashboard-comparison-section")}
          />
        </div>

        {!isPanelCollapsed("dashboard-comparison-section") ? (
      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <CurrentBarChart
          accent="var(--accent)"
          formatter={formatPercent}
          processes={processes}
          selector={(process) => process.cpu}
          title="Per-process CPU"
        />
        <CurrentBarChart
          accent="var(--success)"
          formatter={formatBytes}
          processes={processes}
          selector={(process) => process.memory}
          title="Per-process memory"
        />
      </div>
        ) : null}
      </div>

      <div className="panel p-3" data-ui="dashboard-heatmap-section">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="section-kicker">Load heatmap</div>
            <div className="mt-1 text-sm text-[color:var(--text-muted)]">
              Relative CPU and memory intensity across the selected processes.
            </div>
          </div>
          <CollapseToggleButton
            collapsed={isPanelCollapsed("dashboard-heatmap-section")}
            onClick={() => onTogglePanel("dashboard-heatmap-section")}
          />
        </div>

        {!isPanelCollapsed("dashboard-heatmap-section") ? (
          <div className="mt-3">
            <HeatmapGrid processes={processes} />
          </div>
        ) : null}
      </div>

      <div className="panel overflow-hidden" data-ui="dashboard-process-details">
        <div className="border-b border-[color:var(--border)] px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="section-kicker">Process details</div>
              <div className="mt-1 text-sm text-[color:var(--text-muted)]">
                Live PM2 metadata, runtime state, and safe controls for the selected services
              </div>
            </div>
            {logError ? (
              <div className="flash py-2 text-xs" data-tone="error">
                {logError}
              </div>
            ) : null}
            <CollapseToggleButton
              collapsed={isPanelCollapsed("dashboard-process-details")}
              onClick={() => onTogglePanel("dashboard-process-details")}
            />
          </div>
        </div>

        {!isPanelCollapsed("dashboard-process-details") ? (
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed" data-ui="dashboard-process-table">
            <thead className="border-b border-[color:var(--border)] text-left text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-soft)]">
              <tr>
                <th className="px-4 py-3">Process</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">PID</th>
                <th className="px-4 py-3">CPU</th>
                <th className="px-4 py-3">Memory</th>
                <th className="px-4 py-3">Uptime</th>
                <th className="px-4 py-3">Version</th>
                <th className="px-4 py-3">Git</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {processes.length === 0 ? (
                <tr>
                  <td className="px-4 py-12 text-center text-sm text-[color:var(--text-muted)]" colSpan={9}>
                    Waiting for the first dashboard snapshot...
                  </td>
                </tr>
              ) : (
                processes.map((process) => (
                  <tr
                    className="border-b border-[color:var(--border)] text-sm text-[color:var(--text-muted)] hover:bg-[color:var(--surface-soft)]"
                    data-process-id={process.pmId}
                    data-ui="dashboard-process-row"
                    key={`dashboard-row-${process.pmId}`}
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium text-[color:var(--text)]">{process.name}</div>
                      <div className="mt-1 text-[11px] text-[color:var(--text-soft)]">
                        PM2 ID {process.pmId}
                      </div>
                      {process.execMode ? (
                        <div className="mt-1 text-[11px] text-[color:var(--text-soft)]">{process.execMode}</div>
                      ) : null}
                      {process.cwd ? (
                        <div className="mt-1 truncate text-[11px] text-[color:var(--text-soft)]" title={process.cwd}>
                          {process.cwd}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill status={process.status} />
                        {process.unstableRestarts > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-transparent bg-[color:var(--warning-soft)] px-2 py-1 text-[11px] font-medium leading-none text-[color:var(--warning)]">
                            <AlertTriangle className="size-3.5 shrink-0" />
                            {process.unstableRestarts} unstable
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">{process.pid ?? "n/a"}</td>
                    <td className="px-4 py-3 align-top">{formatPercent(process.cpu)}</td>
                    <td className="px-4 py-3 align-top">{formatBytes(process.memory)}</td>
                    <td className="px-4 py-3 align-top">{formatUptime(process.uptime)}</td>
                    <td className="px-4 py-3 align-top">
                      <div className="text-[color:var(--text)]">{process.version ?? "n/a"}</div>
                      {process.nodeVersion ? (
                        <div className="mt-1 text-[11px] text-[color:var(--text-soft)]">
                          Node {process.nodeVersion}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="text-[color:var(--text)]">{process.gitBranch ?? "n/a"}</div>
                      {process.gitRevision ? (
                        <div className="mt-1 text-[11px] text-[color:var(--text-soft)]">
                          {process.gitRevision.slice(0, 8)}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 align-top">
                      {canManageActions ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="button-secondary px-2.5 py-1.5 text-xs"
                            disabled={!!actionBusyLabel}
                            onClick={() => onAction("reload", [process.pmId])}
                            type="button"
                          >
                            Reload
                          </button>
                          <button
                            className="button-primary px-2.5 py-1.5 text-xs"
                            disabled={!!actionBusyLabel}
                            onClick={() => onAction("restart", [process.pmId])}
                            type="button"
                          >
                            Restart
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-[color:var(--text-soft)]">Read-only</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        ) : null}
      </div>

      {!isPanelCollapsed("embedded-log-panel") ? (
        <EmbeddedLogPanel
          error={logError}
          lines={logLines}
          onOpenLogs={onOpenLogs}
          onToggleCollapsed={() => onTogglePanel("embedded-log-panel")}
          status={logStatus}
        />
      ) : (
        <div className="panel px-4 py-3" data-ui="embedded-log-panel">
          <div className="flex items-center justify-between gap-3">
            <div className="section-kicker">Embedded logs</div>
            <CollapseToggleButton
              collapsed
              onClick={() => onTogglePanel("embedded-log-panel")}
            />
          </div>
        </div>
      )}
    </section>
  );
}
