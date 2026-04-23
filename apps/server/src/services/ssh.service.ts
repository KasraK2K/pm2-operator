import { createHash, randomUUID } from "crypto";

import type { ClientChannel, ConnectConfig, PseudoTtyOptions } from "ssh2";
import { Client } from "ssh2";

import { AppError } from "../utils/app-error";
import { parsePm2RuntimeProcesses, stripAnsiSequences } from "../utils/pm2";
import { resolveHostSecrets } from "./host.service";
import type { HostRuntimeSummary } from "./monitor.service";

interface HostLike {
  host: string;
  port: number;
  username: string;
  authType: "PASSWORD" | "PRIVATE_KEY";
  hostFingerprint: string | null;
  encryptedPassword: string | null;
  encryptedPrivateKey: string | null;
  encryptedPassphrase: string | null;
}

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  fingerprint: string;
}

interface ShellSession {
  connection: Client;
  stream: ClientChannel;
  fingerprint: string;
}

export type Pm2DashboardAction = "restart" | "reload";

function formatFingerprint(key: Buffer) {
  return `SHA256:${createHash("sha256").update(key).digest("base64")}`;
}

function mapSshError(error: Error, context: { mismatch: boolean }) {
  if (context.mismatch) {
    return new AppError(400, "HOST_KEY_MISMATCH", "SSH host fingerprint does not match the pinned value.");
  }

  const message = error.message.toLowerCase();

  if (message.includes("all configured authentication methods failed")) {
    return new AppError(401, "AUTH_FAILED", "SSH authentication failed.");
  }

  if (message.includes("timed out")) {
    return new AppError(504, "COMMAND_TIMEOUT", "SSH connection timed out.");
  }

  if (message.includes("connect") || message.includes("econnrefused") || message.includes("enotfound")) {
    return new AppError(502, "HOST_UNREACHABLE", "SSH host is unreachable.");
  }

  return new AppError(502, "SSH_ERROR", error.message);
}

function escapeShellArg(value: string | number) {
  if (typeof value === "number") {
    return String(value);
  }

  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseShellTranscript(
  transcript: string,
  beginMarker: string,
  exitMarkerPrefix: string
) {
  const normalized = transcript.replace(/\r/g, "");
  const beginPattern = new RegExp(`${escapeRegex(beginMarker)}(?=\\s*(?:\\n|$))`);
  const beginMatch = beginPattern.exec(normalized);
  const beginIndex = beginMatch ? beginMatch.index : -1;
  const beginLineEnd = beginIndex === -1 ? -1 : normalized.indexOf("\n", beginIndex);
  const bodyStart = beginIndex === -1 ? 0 : beginLineEnd === -1 ? beginIndex + beginMarker.length : beginLineEnd + 1;
  const exitPattern = new RegExp(`${escapeRegex(exitMarkerPrefix)}(\\d+)`);
  const exitMatch = exitPattern.exec(normalized.slice(bodyStart));
  const exitIndex = exitMatch ? bodyStart + exitMatch.index : -1;
  const exitCode = exitMatch ? Number(exitMatch[1]) : null;

  if (beginIndex !== -1 && exitIndex !== -1 && exitIndex > bodyStart) {
    return {
      body: normalized.slice(bodyStart, exitIndex).trim(),
      exitCode
    };
  }

  return {
    body: normalized.trim(),
    exitCode
  };
}

export function stripEchoedShellLines(body: string, echoedLines: string[]) {
  const exactLines = new Set(echoedLines.map((line) => line.trim()).filter(Boolean));

  return body
    .split("\n")
    .filter((line) => !exactLines.has(line.trim()))
    .join("\n")
    .trim();
}

export function wrapCommandForLoginShell(command: string) {
  const escapedCommand = escapeShellArg(command);

  return [
    'if [ -n "$SHELL" ] && [ -x "$SHELL" ]; then',
    'case "$(basename "$SHELL")" in',
    `bash|zsh|ksh) "$SHELL" -lc ${escapedCommand} ;;`,
    `*) "$SHELL" -c ${escapedCommand} ;;`,
    "esac;",
    "elif command -v bash >/dev/null 2>&1; then",
    `bash -lc ${escapedCommand};`,
    "elif command -v zsh >/dev/null 2>&1; then",
    `zsh -lc ${escapedCommand};`,
    "else",
    `sh -c ${escapedCommand};`,
    "fi"
  ].join(" ");
}

async function openShell(host: HostLike, options?: { repinFingerprint?: boolean }): Promise<ShellSession> {
  const secrets = resolveHostSecrets(host);

  if (host.authType === "PASSWORD" && !secrets.password) {
    throw new AppError(400, "SSH_SECRET_MISSING", "SSH password is missing. Edit the host and re-enter its password.");
  }

  if (host.authType === "PRIVATE_KEY" && !secrets.privateKey) {
    throw new AppError(400, "SSH_SECRET_MISSING", "SSH private key is missing. Edit the host and re-enter its private key.");
  }

  return new Promise((resolve, reject) => {
    const connection = new Client();
    let fingerprint = host.hostFingerprint ?? "";
    const errorContext = { mismatch: false };
    let settled = false;

    const connectConfig: ConnectConfig = {
      host: host.host,
      port: host.port,
      username: host.username,
      readyTimeout: 15_000,
      hostVerifier: (key: Buffer) => {
        const formatted = formatFingerprint(Buffer.from(key));
        fingerprint = formatted;

        if (host.hostFingerprint && !options?.repinFingerprint && host.hostFingerprint !== formatted) {
          errorContext.mismatch = true;
          return false;
        }

        return true;
      }
    };

    if (host.authType === "PASSWORD") {
      connectConfig.password = secrets.password;
    } else {
      connectConfig.privateKey = secrets.privateKey;
      connectConfig.passphrase = secrets.passphrase;
    }

    const fail = (error: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      connection.end();
      reject(mapSshError(error, errorContext));
    };

    connection.on("error", fail);
    connection.on("ready", () => {
      const ptyOptions: PseudoTtyOptions = {
        term: "vt100",
        rows: 24,
        cols: 80,
        width: 640,
        height: 480,
        modes: {
          ECHO: 0,
          ECHOE: 0,
          ECHOK: 0,
          ECHONL: 0,
          ECHOCTL: 0
        }
      };

      connection.shell(ptyOptions, (error: Error | undefined, stream: ClientChannel) => {
        if (error) {
          fail(error);
          return;
        }

        settled = true;
        stream.setEncoding("utf8");
        resolve({
          connection,
          stream,
          fingerprint
        });
      });
    });

    connection.connect(connectConfig);
  });
}

async function closeSession(session: ShellSession) {
  try {
    session.stream.end("exit\n");
  } catch {
    // no-op
  }

  try {
    session.connection.end();
  } catch {
    // no-op
  }
}

async function runShellCommand(
  host: HostLike,
  command: string,
  options?: { repinFingerprint?: boolean }
): Promise<CommandResult> {
  const session = await openShell(host, options);
  const marker = randomUUID().replace(/-/g, "");
  const beginMarker = `__PM2LV_BEGIN__${marker}`;
  const exitMarkerPrefix = `__PM2LV_EXIT__${marker}:`;
  const wrappedCommand = wrapCommandForLoginShell(command);
  const echoedExitCommand = `printf '${exitMarkerPrefix}%s\\n' "$?"`;

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let finished = false;

    const finish = async (callback: () => void) => {
      if (finished) {
        return;
      }

      finished = true;
      await closeSession(session);
      callback();
    };

    session.stream.on("data", (chunk: string) => {
      stdout += chunk;
    });

    session.stream.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    session.stream.on("close", () => {
      const parsed = parseShellTranscript(stdout, beginMarker, exitMarkerPrefix);
      const cleanStdout = stripEchoedShellLines(parsed.body, [wrappedCommand, echoedExitCommand]);

      void finish(() => {
        resolve({
          stdout: cleanStdout,
          stderr: stderr.trim(),
          exitCode: parsed.exitCode,
          fingerprint: session.fingerprint
        });
      });
    });

    session.stream.on("error", (error: Error) => {
      void finish(() => reject(mapSshError(error, { mismatch: false })));
    });

    session.stream.write("stty -echo >/dev/null 2>&1 || true\n");
    session.stream.write(`printf '${beginMarker}\\n'\n`);
    session.stream.write(`${wrappedCommand}\n`);
    session.stream.write(`printf '${exitMarkerPrefix}%s\\n' "$?"\n`);
    session.stream.write("exit\n");
  });
}

function buildCombinedOutput(result: CommandResult) {
  return [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
}

const OS_MARKER_PATTERN = /\b(Linux|Darwin|FreeBSD|OpenBSD|SunOS|AIX)\b/;

function stripTrailingPrompt(value: string) {
  return value.replace(/\s+[^\s@]+@[^\s:]+(?::[^\s]*)?[#>$]\s*$/g, "").trim();
}

export function extractOsSummary(result: CommandResult) {
  const combined = stripAnsiSequences(buildCombinedOutput(result)).replace(/\r/g, "");
  const lines = combined
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const match = OS_MARKER_PATTERN.exec(line);

    if (!match) {
      continue;
    }

    const candidate = stripTrailingPrompt(line.slice(match.index));

    if (candidate.startsWith("Linux ") && candidate.includes("GNU/Linux")) {
      return candidate.slice(0, candidate.indexOf("GNU/Linux") + "GNU/Linux".length).trim();
    }

    return candidate;
  }

  return stripTrailingPrompt(combined.replace(/\s+/g, " ").trim());
}

function parsePrefixedValueLine(output: string, prefix: string) {
  const lines = stripAnsiSequences(output).replace(/\r/g, "").split("\n");

  for (const line of lines) {
    const index = line.indexOf(prefix);

    if (index === -1) {
      continue;
    }

    return line.slice(index + prefix.length).trim() || null;
  }

  return null;
}

function parseNumberValue(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseLoadAverageValue(value: string | null) {
  if (!value) {
    return [] as number[];
  }

  return value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));
}

export function isPm2Missing(result: CommandResult) {
  const combined = buildCombinedOutput(result).toLowerCase();

  return (
    result.exitCode === 127 ||
    combined.includes("pm2: command not found") ||
    combined.includes("pm2 command not found") ||
    combined.includes("command not found: pm2")
  );
}

function ensurePm2Available(result: CommandResult, context: string) {
  if (isPm2Missing(result)) {
    throw new AppError(400, "PM2_NOT_FOUND", "PM2 is not available in the remote shell path.");
  }

  if (result.exitCode === null) {
    throw new AppError(502, "SSH_COMMAND_PARSE_FAILED", `Could not parse the SSH command result for ${context}.`, {
      output: buildCombinedOutput(result)
    });
  }

  if (result.exitCode !== 0) {
    throw new AppError(502, "PM2_COMMAND_FAILED", `PM2 command failed while running ${context}.`, {
      exitCode: result.exitCode,
      output: buildCombinedOutput(result)
    });
  }
}

export function extractPm2Version(result: CommandResult) {
  const combined = buildCombinedOutput(result);
  const matches = combined.match(/\b\d+\.\d+\.\d+\b/g);

  if (matches && matches.length > 0) {
    return matches[matches.length - 1];
  }

  return combined.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1) ?? "";
}

export async function testSshConnection(host: HostLike, options?: { repinFingerprint?: boolean }) {
  const uname = await runShellCommand(host, "uname -a", options);
  const pm2 = await runShellCommand(host, "pm2 -v", options);

  ensurePm2Available(pm2, "pm2 -v");

  return {
    os: extractOsSummary(uname),
    pm2Version: extractPm2Version(pm2),
    fingerprint: pm2.fingerprint
  };
}

export async function readPm2RuntimeProcesses(host: HostLike) {
  const result = await runShellCommand(host, "pm2 jlist");

  ensurePm2Available(result, "pm2 jlist");

  return {
    fingerprint: result.fingerprint,
    processes: parsePm2RuntimeProcesses(buildCombinedOutput(result))
  };
}

export async function discoverPm2Processes(host: HostLike) {
  const result = await readPm2RuntimeProcesses(host);

  return {
    fingerprint: result.fingerprint,
    processes: result.processes.map((process) => ({
      name: process.name,
      pmId: process.pmId,
      status: process.status,
      pid: process.pid,
      cpu: process.cpu,
      memory: process.memory,
      uptime: process.uptime,
      restartCount: process.restartCount
    }))
  };
}

export async function readHostRuntimeSummary(host: HostLike): Promise<HostRuntimeSummary | null> {
  const hostMetricsCommand =
    "node -e \"const os=require('os'); console.log('hostname=' + os.hostname()); console.log('cpuCores=' + os.cpus().length); console.log('totalMemory=' + os.totalmem()); console.log('loadAverage=' + os.loadavg().join(','));\"";

  const [unameResult, pm2VersionResult, nodeMetricsResult] = await Promise.allSettled([
    runShellCommand(host, "uname -a"),
    runShellCommand(host, "pm2 -v"),
    runShellCommand(host, hostMetricsCommand)
  ]);

  const os =
    unameResult.status === "fulfilled"
      ? extractOsSummary(unameResult.value) || null
      : null;

  const pm2Version =
    pm2VersionResult.status === "fulfilled" && !isPm2Missing(pm2VersionResult.value)
      ? extractPm2Version(pm2VersionResult.value) || null
      : null;

  const nodeMetricsOutput =
    nodeMetricsResult.status === "fulfilled" ? buildCombinedOutput(nodeMetricsResult.value) : "";

  const summary: HostRuntimeSummary = {
    hostname: parsePrefixedValueLine(nodeMetricsOutput, "hostname="),
    os,
    pm2Version,
    cpuCores: parseNumberValue(parsePrefixedValueLine(nodeMetricsOutput, "cpuCores=")),
    totalMemory: parseNumberValue(parsePrefixedValueLine(nodeMetricsOutput, "totalMemory=")),
    loadAverage: parseLoadAverageValue(parsePrefixedValueLine(nodeMetricsOutput, "loadAverage="))
  };

  if (
    !summary.hostname &&
    !summary.os &&
    !summary.pm2Version &&
    summary.cpuCores === null &&
    summary.totalMemory === null &&
    summary.loadAverage.length === 0
  ) {
    return null;
  }

  return summary;
}

export async function runPm2Action(
  host: HostLike,
  action: Pm2DashboardAction,
  processIds: number[]
) {
  const args = processIds.map((processId) => escapeShellArg(processId)).join(" ");
  const result = await runShellCommand(host, `pm2 ${action} ${args}`);

  ensurePm2Available(result, `pm2 ${action}`);

  return {
    fingerprint: result.fingerprint,
    output: buildCombinedOutput(result)
  };
}

export async function createLogStream(
  host: HostLike,
  processIdOrName: string | number,
  initialLines: number
) {
  const session = await openShell(host);
  const beginMarker = `__PM2LV_STREAM_BEGIN__${randomUUID().replace(/-/g, "")}`;
  const command = wrapCommandForLoginShell(
    `printf '${beginMarker}\\n'; exec pm2 logs ${escapeShellArg(processIdOrName)} --raw --lines ${initialLines}`
  );

  session.stream.write("stty -echo >/dev/null 2>&1 || true\n");
  session.stream.write(`${command}\n`);

  return {
    beginMarker,
    fingerprint: session.fingerprint,
    stream: session.stream,
    stop: async () => {
      try {
        session.stream.write("\u0003");
      } catch {
        // no-op
      }

      await closeSession(session);
    }
  };
}
