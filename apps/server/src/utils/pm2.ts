import { AppError } from "./app-error";

export interface Pm2Process {
  name: string;
  pmId: number;
  status: string;
  pid: number | null;
  cpu: number;
  memory: number;
  uptime: number | null;
  restartCount: number;
}

export interface Pm2RuntimeProcess extends Pm2Process {
  cwd: string | null;
  execPath: string | null;
  execMode: string | null;
  version: string | null;
  nodeVersion: string | null;
  gitBranch: string | null;
  gitRevision: string | null;
  repoPath: string | null;
  unstableRestarts: number;
  outputLogPath: string | null;
  errorLogPath: string | null;
}

interface RawPm2Process {
  name?: string;
  pm_id?: number;
  pid?: number;
  version?: string;
  monit?: {
    cpu?: number;
    memory?: number;
  };
  pm2_env?: {
    status?: string;
    pm_uptime?: number;
    restart_time?: number;
    unstable_restarts?: number;
    pm_cwd?: string;
    pm_exec_path?: string;
    exec_mode?: string;
    version?: string;
    node_version?: string;
    pm_out_log_path?: string;
    pm_err_log_path?: string;
    versioning?: {
      branch?: string;
      revision?: string;
      repo_path?: string;
    };
  };
}

export function stripAnsiSequences(value: string) {
  return value
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001a\u001c-\u001f\u007f]/g, "");
}

export function extractJsonArray(output: string): string {
  const sanitized = stripAnsiSequences(output);
  const start = sanitized.search(/\[\s*(?:\{|\])/);

  if (start === -1) {
    throw new AppError(502, "INVALID_PM2_JSON", "pm2 jlist did not return a JSON array.", {
      output: sanitized.slice(0, 600)
    });
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < sanitized.length; index += 1) {
    const character = sanitized[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (character === "\\") {
        escaped = true;
        continue;
      }

      if (character === '"') {
        inString = false;
      }

      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === "[") {
      depth += 1;
      continue;
    }

    if (character === "]") {
      depth -= 1;

      if (depth === 0) {
        return sanitized.slice(start, index + 1);
      }
    }
  }

  throw new AppError(502, "INVALID_PM2_JSON", "pm2 jlist output did not contain a complete JSON array.", {
    output: sanitized.slice(start, start + 600)
  });
}

function parsePm2Json(output: string) {
  const json = extractJsonArray(output);
  let parsed: RawPm2Process[];

  try {
    parsed = JSON.parse(json) as RawPm2Process[];
  } catch {
    throw new AppError(502, "INVALID_PM2_JSON", "pm2 jlist returned malformed JSON.", {
      output: stripAnsiSequences(output).slice(0, 400)
    });
  }

  if (!Array.isArray(parsed)) {
    throw new AppError(502, "INVALID_PM2_JSON", "pm2 jlist response was not a process array.");
  }

  return parsed;
}

export function parsePm2RuntimeProcesses(output: string): Pm2RuntimeProcess[] {
  return parsePm2Json(output).map((item) => ({
    name: item.name ?? "unknown",
    pmId: item.pm_id ?? -1,
    status: item.pm2_env?.status ?? "unknown",
    pid: typeof item.pid === "number" ? item.pid : null,
    cpu: item.monit?.cpu ?? 0,
    memory: item.monit?.memory ?? 0,
    uptime: item.pm2_env?.pm_uptime ?? null,
    restartCount: item.pm2_env?.restart_time ?? 0,
    cwd: item.pm2_env?.pm_cwd ?? null,
    execPath: item.pm2_env?.pm_exec_path ?? null,
    execMode: item.pm2_env?.exec_mode ?? null,
    version: item.pm2_env?.version ?? item.version ?? null,
    nodeVersion: item.pm2_env?.node_version ?? null,
    gitBranch: item.pm2_env?.versioning?.branch ?? null,
    gitRevision: item.pm2_env?.versioning?.revision ?? null,
    repoPath: item.pm2_env?.versioning?.repo_path ?? null,
    unstableRestarts: item.pm2_env?.unstable_restarts ?? 0,
    outputLogPath: item.pm2_env?.pm_out_log_path ?? null,
    errorLogPath: item.pm2_env?.pm_err_log_path ?? null
  }));
}

export function parsePm2List(output: string): Pm2Process[] {
  return parsePm2RuntimeProcesses(output).map((item) => ({
    name: item.name,
    pmId: item.pmId,
    status: item.status,
    pid: item.pid,
    cpu: item.cpu,
    memory: item.memory,
    uptime: item.uptime,
    restartCount: item.restartCount
  }));
}
