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

interface RawPm2Process {
  name?: string;
  pm_id?: number;
  pid?: number;
  monit?: {
    cpu?: number;
    memory?: number;
  };
  pm2_env?: {
    status?: string;
    pm_uptime?: number;
    restart_time?: number;
  };
}

export function stripAnsiSequences(value: string) {
  return value.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

export function extractJsonArray(output: string): string {
  const sanitized = stripAnsiSequences(output);
  const start = sanitized.search(/\[\s*(?:\{|\])/);

  if (start === -1) {
    throw new AppError(502, "INVALID_PM2_JSON", "pm2 jlist did not return a JSON array.");
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

  throw new AppError(502, "INVALID_PM2_JSON", "pm2 jlist output did not contain a complete JSON array.");
}

export function parsePm2List(output: string): Pm2Process[] {
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

  return parsed.map((item) => ({
    name: item.name ?? "unknown",
    pmId: item.pm_id ?? -1,
    status: item.pm2_env?.status ?? "unknown",
    pid: typeof item.pid === "number" ? item.pid : null,
    cpu: item.monit?.cpu ?? 0,
    memory: item.monit?.memory ?? 0,
    uptime: item.pm2_env?.pm_uptime ?? null,
    restartCount: item.pm2_env?.restart_time ?? 0
  }));
}
