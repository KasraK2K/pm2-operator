import type { Pm2RuntimeProcess } from "../utils/pm2";

export interface DashboardTarget {
  pmId: number;
  label?: string;
}

export interface HostRuntimeSummary {
  hostname: string | null;
  os: string | null;
  pm2Version: string | null;
  cpuCores: number | null;
  totalMemory: number | null;
  loadAverage: number[];
}

export interface Pm2DashboardAggregate {
  totalCpu: number;
  totalMemory: number;
  processCount: number;
  onlineCount: number;
  stoppedCount: number;
  erroredCount: number;
  restartDelta: number;
}

export interface Pm2DashboardProcessState extends Pm2RuntimeProcess {
  selectedLabel: string;
}

export interface Pm2DashboardSnapshot {
  timestamp: string;
  fingerprint: string;
  host: HostRuntimeSummary | null;
  selection: {
    hostId: string;
    targetPmIds: number[];
    targetLabels: string[];
    missingTargetPmIds: number[];
  };
  aggregate: Pm2DashboardAggregate;
  processes: Pm2DashboardProcessState[];
}

interface BuildDashboardSnapshotOptions {
  hostId: string;
  fingerprint: string;
  host: HostRuntimeSummary | null;
  processes: Pm2RuntimeProcess[];
  targets: DashboardTarget[];
  restartBaseline: Map<number, number>;
  timestamp?: string;
}

export function buildDashboardSnapshot(options: BuildDashboardSnapshotOptions): Pm2DashboardSnapshot {
  const targetIds = options.targets.map((target) => target.pmId);
  const processLookup = new Map(options.processes.map((process) => [process.pmId, process]));
  const selectedProcesses = options.targets
    .map((target) => {
      const process = processLookup.get(target.pmId);

      if (!process) {
        return null;
      }

      return {
        ...process,
        selectedLabel: target.label ?? process.name
      };
    })
    .filter((process): process is Pm2DashboardProcessState => process !== null);

  const missingTargetPmIds = targetIds.filter((pmId) => !processLookup.has(pmId));

  const aggregate = selectedProcesses.reduce<Pm2DashboardAggregate>(
    (current, process) => {
      const baseline = options.restartBaseline.get(process.pmId) ?? process.restartCount;
      return {
        totalCpu: current.totalCpu + process.cpu,
        totalMemory: current.totalMemory + process.memory,
        processCount: current.processCount + 1,
        onlineCount: current.onlineCount + (process.status === "online" ? 1 : 0),
        stoppedCount: current.stoppedCount + (process.status === "stopped" ? 1 : 0),
        erroredCount: current.erroredCount + (process.status === "errored" ? 1 : 0),
        restartDelta: current.restartDelta + Math.max(0, process.restartCount - baseline)
      };
    },
    {
      totalCpu: 0,
      totalMemory: 0,
      processCount: 0,
      onlineCount: 0,
      stoppedCount: 0,
      erroredCount: 0,
      restartDelta: 0
    }
  );

  return {
    timestamp: options.timestamp ?? new Date().toISOString(),
    fingerprint: options.fingerprint,
    host: options.host,
    selection: {
      hostId: options.hostId,
      targetPmIds: targetIds,
      targetLabels: options.targets.map((target) => target.label ?? String(target.pmId)),
      missingTargetPmIds
    },
    aggregate,
    processes: selectedProcesses
  };
}
