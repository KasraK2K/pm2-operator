import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Cpu,
  HardDrive,
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
  Pm2DashboardSnapshot,
  Pm2Process
} from "../lib/types";

interface MonitorDashboardProps {
  host: Host | null;
  activeTargets: Pm2Process[];
  snapshot: Pm2DashboardSnapshot | null;
  dashboardStatus: string;
  dashboardError: string | null;
  logStatus: string;
  logError: string | null;
  logLines: LogLine[];
  canManageActions: boolean;
  actionBusyLabel: string | null;
  isPanelCollapsed: (panelId: string) => boolean;
  onAction: (action: Pm2DashboardAction, processIds: number[]) => void;
  onBackToProcesses: () => void;
  onOpenLogs: () => void;
  onRefresh: () => void;
  onTogglePanel: (panelId: string) => void;
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
          <div className="mt-1 text-xs text-[color:var(--text-soft)]">{visibleLines.length} / {status}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <CollapseToggleButton collapsed={false} onClick={onToggleCollapsed} />
          <button className="button-secondary" onClick={onOpenLogs} type="button">
            <TerminalSquare className="mr-2 size-4" />
            Open logs
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
            Waiting...
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
  dashboardStatus,
  dashboardError,
  logStatus,
  logError,
  logLines,
  canManageActions,
  actionBusyLabel,
  isPanelCollapsed,
  onAction,
  onBackToProcesses,
  onOpenLogs,
  onRefresh,
  onTogglePanel
}: MonitorDashboardProps) {
  if (!host || activeTargets.length === 0) {
    return (
      <section className="panel flex min-h-0 flex-1 items-center justify-center px-6 py-8 text-center">
        <div className="max-w-sm space-y-2">
          <div className="section-kicker">PM2 dashboard</div>
          <div className="text-base font-semibold text-[color:var(--text)]">Select processes to monitor.</div>
        </div>
      </section>
    );
  }

  const processes = snapshot?.processes ?? [];
  const aggregate = snapshot?.aggregate;
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
      <div className="flex flex-wrap items-center justify-between gap-2" data-ui="dashboard-toolbar">
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
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold text-[color:var(--text)]">{host.name}</h3>
              <span className="badge">{dashboardStatus}</span>
              <span className="badge">{activeTargets.length} target{activeTargets.length === 1 ? "" : "s"}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button className="button-secondary" onClick={onRefresh} type="button">
            <RefreshCw className="mr-2 size-4" />
            Refresh
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
                Reload
              </button>
              <button
                className="button-primary"
                disabled={processes.length === 0 || !!actionBusyLabel}
                onClick={() => onAction("restart", processes.map((process) => process.pmId))}
                type="button"
              >
                <RotateCcw className="mr-2 size-4" />
                Restart
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-2" data-ui="dashboard-targets">
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
        <div className="flash" data-tone="info">
          {actionBusyLabel}
        </div>
      ) : null}

      {dashboardError ? (
        <div className="flash" data-tone="error">
          {dashboardError}
        </div>
      ) : null}

      {missingTargetPmIds.length > 0 ? (
        <div className="flash" data-tone="info">
          Missing PM2 IDs: {missingTargetPmIds.join(", ")}
        </div>
      ) : null}

      <div className="panel p-3" data-ui="dashboard-kpi-strip">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="section-kicker">KPIs</div>
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
          </div>
          <CollapseToggleButton
            collapsed={isPanelCollapsed("dashboard-runtime-section")}
            onClick={() => onTogglePanel("dashboard-runtime-section")}
          />
        </div>

        {!isPanelCollapsed("dashboard-runtime-section") ? (
      <div className="mt-3">
        <div className="panel-soft p-3" data-ui="dashboard-host-summary">
          <div className="section-kicker">Host summary</div>

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
      </div>
        ) : null}
      </div>

      <div className="panel overflow-hidden" data-ui="dashboard-process-details">
        <div className="border-b border-[color:var(--border)] px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="section-kicker">Process details</div>
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
