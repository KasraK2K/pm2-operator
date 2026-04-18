import type { Server as HttpServer } from "http";
import type { UserRole } from "@prisma/client";

import { Server } from "socket.io";
import { z } from "zod";

import { env } from "./config/env";
import { logger } from "./lib/logger";
import { prisma } from "./lib/prisma";
import { writeAuditLog } from "./services/audit.service";
import { verifyAccessToken } from "./services/auth.service";
import { assertWorkspaceManager } from "./services/authorization.service";
import { buildDashboardSnapshot } from "./services/monitor.service";
import {
  createLogStream,
  readHostRuntimeSummary,
  readPm2RuntimeProcesses,
  runPm2Action
} from "./services/ssh.service";
import { AppError } from "./utils/app-error";
import { cleanLogLine, consumeBeginMarkerLine, shouldIgnoreLogLine } from "./utils/log-stream";
import { RingBuffer } from "./utils/ring-buffer";

const DASHBOARD_POLL_INTERVAL_MS = 3_000;
const HOST_SUMMARY_REFRESH_MS = 15_000;

const processSelectorSchema = z.union([z.number().int(), z.string().trim().min(1)]);

const logTargetSchema = z.object({
  processIdOrName: processSelectorSchema,
  label: z.string().trim().min(1).max(120).optional()
});

const dashboardTargetSchema = z.object({
  pmId: z.number().int().min(0),
  label: z.string().trim().min(1).max(120).optional()
});

const logStartSchema = z
  .object({
    hostId: z.string().uuid(),
    processIdOrName: processSelectorSchema.optional(),
    targets: z.array(logTargetSchema).min(1).max(20).optional(),
    initialLines: z.number().int().min(1).max(5000).default(200)
  })
  .superRefine((value, context) => {
    const hasSingleTarget = value.processIdOrName !== undefined;
    const hasMultipleTargets = (value.targets?.length ?? 0) > 0;

    if (!hasSingleTarget && !hasMultipleTargets) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targets"],
        message: "At least one PM2 process must be selected."
      });
    }

    if (hasSingleTarget && hasMultipleTargets) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targets"],
        message: "Provide either one process or a target list, not both."
      });
    }
  });

const dashboardStartSchema = z.object({
  hostId: z.string().uuid(),
  targets: z.array(dashboardTargetSchema).min(1).max(20)
});

const dashboardActionSchema = z.object({
  hostId: z.string().uuid(),
  action: z.enum(["restart", "reload"]),
  targetPmIds: z.array(z.number().int().min(0)).min(1).max(20)
});

type LogTarget = z.infer<typeof logTargetSchema>;
type DashboardTarget = z.infer<typeof dashboardTargetSchema>;

type ActiveLogStream = {
  stop: () => Promise<void>;
  suppressStoppedStatus: () => void;
};

type ActiveDashboardSession = {
  stop: () => void;
  pollNow: () => Promise<void>;
};

function normalizeTargets(payload: z.infer<typeof logStartSchema>): LogTarget[] {
  if (payload.targets) {
    return payload.targets;
  }

  return [
    {
      processIdOrName: payload.processIdOrName!
    }
  ];
}

function getProcessLabel(target: LogTarget) {
  return target.label ?? String(target.processIdOrName);
}

function getProcessKey(target: LogTarget) {
  return `${typeof target.processIdOrName}:${String(target.processIdOrName)}`;
}

function toAppError(error: unknown, fallbackCode: string, fallbackMessage: string) {
  if (error instanceof AppError) {
    return error;
  }

  return new AppError(400, fallbackCode, fallbackMessage, {
    cause: error instanceof Error ? error.message : "unknown"
  });
}

export function createSocketServer(server: HttpServer) {
  const io = new Server(server, {
    cors: {
      origin: env.CORS_ORIGIN,
      credentials: true
    }
  });

  const activeLogStreams = new Map<string, ActiveLogStream>();
  const activeDashboardSessions = new Map<string, ActiveDashboardSession>();

  io.use((socket, next) => {
    try {
      const token =
        (socket.handshake.auth.token as string | undefined) ??
        socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, "");

      if (!token) {
        next(new AppError(401, "UNAUTHORIZED", "Missing socket token."));
        return;
      }

      const payload = verifyAccessToken(token);
      socket.data.user = payload;
      next();
    } catch (error) {
      next(error as Error);
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as { userId: string; email: string; role: UserRole };

    const stopCurrentLogStream = async (options?: { suppressStatus?: boolean }) => {
      const current = activeLogStreams.get(socket.id);

      if (!current) {
        return;
      }

      if (options?.suppressStatus) {
        current.suppressStoppedStatus();
      }

      activeLogStreams.delete(socket.id);
      await current.stop();
    };

    const stopCurrentDashboardSession = () => {
      const current = activeDashboardSessions.get(socket.id);

      if (!current) {
        return;
      }

      activeDashboardSessions.delete(socket.id);
      current.stop();
    };

    socket.on("logs:stop", () => {
      void stopCurrentLogStream();
    });

    socket.on("dashboard:stop", () => {
      stopCurrentDashboardSession();
    });

    socket.on("logs:start", async (rawPayload: unknown) => {
      try {
        const payload = logStartSchema.parse(rawPayload);
        const targets = normalizeTargets(payload);
        await stopCurrentLogStream({ suppressStatus: true });

        const host = await prisma.sshHost.findUnique({
          where: { id: payload.hostId }
        });

        if (!host) {
          throw new AppError(404, "HOST_NOT_FOUND", "SSH host not found.");
        }

        const logBuffer = new RingBuffer<{
          sequence: number;
          line: string;
          source: "stdout" | "stderr";
          timestamp: string;
          processKey: string;
          processLabel: string;
        }>(env.LOG_BUFFER_MAX_LINES);

        let sequence = 0;
        const openedStreams: Array<{
          target: LogTarget;
          handle: Awaited<ReturnType<typeof createLogStream>>;
          leftoverStdout: string;
          leftoverStderr: string;
          closed: boolean;
          ready: boolean;
        }> = [];
        let closedStreams = 0;
        let stopped = false;
        let suppressed = false;

        const emitLine = (line: string, source: "stdout" | "stderr", target: LogTarget) => {
          const entry = {
            sequence: ++sequence,
            line,
            source,
            timestamp: new Date().toISOString(),
            processKey: getProcessKey(target),
            processLabel: getProcessLabel(target)
          };

          logBuffer.push(entry);
          socket.emit("logs:line", entry);
        };

        const emitStopped = () => {
          if (stopped) {
            return;
          }

          stopped = true;

          if (suppressed) {
            return;
          }

          if (activeLogStreams.get(socket.id)?.stop === stopStreams) {
            activeLogStreams.delete(socket.id);
          }

          socket.emit("logs:status", {
            state: "stopped",
            fingerprint: openedStreams[0]?.handle.fingerprint,
            bufferedLines: logBuffer.values().length,
            processCount: targets.length
          });
        };

        const processLogLine = (
          line: string,
          source: "stdout" | "stderr",
          item: (typeof openedStreams)[number]
        ) => {
          if (!item.ready) {
            const beginMatch = consumeBeginMarkerLine(line, item.handle.beginMarker);

            if (!beginMatch.matched) {
              return;
            }

            item.ready = true;

            if (!beginMatch.remainderNormalized || shouldIgnoreLogLine(beginMatch.remainderNormalized)) {
              return;
            }

            emitLine(beginMatch.remainderDisplay, source, item.target);
            return;
          }

          const { displayLine, normalizedLine } = cleanLogLine(line);

          if (shouldIgnoreLogLine(normalizedLine)) {
            return;
          }

          emitLine(displayLine, source, item.target);
        };

        const splitAndEmit = (
          chunk: string,
          current: string,
          source: "stdout" | "stderr",
          item: (typeof openedStreams)[number]
        ): string => {
          const combined = current + chunk;
          const parts = combined.split(/\r?\n/);
          const remainder = parts.pop() ?? "";

          for (const line of parts) {
            processLogLine(line, source, item);
          }

          return remainder;
        };

        const stopStreams = async () => {
          if (stopped) {
            return;
          }

          await Promise.allSettled(openedStreams.map((item) => item.handle.stop()));
        };

        try {
          for (const target of targets) {
            const handle = await createLogStream(host, target.processIdOrName, payload.initialLines);
            openedStreams.push({
              target,
              handle,
              leftoverStdout: "",
              leftoverStderr: "",
              closed: false,
              ready: false
            });
          }
        } catch (error) {
          await Promise.allSettled(openedStreams.map((item) => item.handle.stop()));
          throw error;
        }

        for (const item of openedStreams) {
          const finalize = () => {
            if (item.closed) {
              return;
            }

            item.closed = true;

            if (item.leftoverStdout.trim()) {
              processLogLine(item.leftoverStdout, "stdout", item);
            }

            if (item.leftoverStderr.trim()) {
              processLogLine(item.leftoverStderr, "stderr", item);
            }

            closedStreams += 1;

            if (closedStreams === openedStreams.length) {
              emitStopped();
            }
          };

          item.handle.stream.on("data", (chunk: string) => {
            item.leftoverStdout = splitAndEmit(chunk, item.leftoverStdout, "stdout", item);
          });

          item.handle.stream.stderr.on("data", (chunk: string) => {
            item.leftoverStderr = splitAndEmit(chunk, item.leftoverStderr, "stderr", item);
          });

          item.handle.stream.on("error", (error: Error) => {
            logger.warn(
              {
                error,
                userId: user.userId,
                target: item.target.processIdOrName
              },
              "Log stream connection errored"
            );
            finalize();
          });

          item.handle.stream.on("close", finalize);
        }

        activeLogStreams.set(socket.id, {
          stop: stopStreams,
          suppressStoppedStatus: () => {
            suppressed = true;
          }
        });

        socket.emit("logs:status", {
          state: "streaming",
          fingerprint: openedStreams[0]?.handle.fingerprint,
          bufferedLines: logBuffer.values().length,
          processCount: targets.length
        });

        await writeAuditLog({
          userId: user.userId,
          action: "logs.stream.start",
          targetType: "ssh_host",
          targetId: host.id,
          metadata: {
            targets: targets.map((target) => ({
              processIdOrName: target.processIdOrName,
              label: target.label ?? null
            })),
            initialLines: payload.initialLines
          }
        });
      } catch (error) {
        const appError = toAppError(error, "STREAM_START_FAILED", "Unable to start the log stream.");

        logger.warn({ error: appError, userId: user.userId }, "Log stream failed to start");
        socket.emit("logs:error", {
          code: appError.code,
          message: appError.message,
          details: appError.details
        });
      }
    });

    socket.on("dashboard:start", async (rawPayload: unknown) => {
      try {
        const payload = dashboardStartSchema.parse(rawPayload);
        stopCurrentDashboardSession();

        const host = await prisma.sshHost.findUnique({
          where: { id: payload.hostId }
        });

        if (!host) {
          throw new AppError(404, "HOST_NOT_FOUND", "SSH host not found.");
        }

        let stopped = false;
        let inFlight = false;
        let interval: NodeJS.Timeout | null = null;
        let hostSummaryCache = await readHostRuntimeSummary(host).catch(() => null);
        let lastHostSummaryAt = Date.now();
        const restartBaseline = new Map<number, number>();

        const refreshHostSummary = async (force = false) => {
          if (!force && hostSummaryCache && Date.now() - lastHostSummaryAt < HOST_SUMMARY_REFRESH_MS) {
            return hostSummaryCache;
          }

          try {
            const next = await readHostRuntimeSummary(host);

            if (next) {
              hostSummaryCache = next;
            }
          } catch (error) {
            logger.warn(
              {
                error,
                userId: user.userId,
                hostId: host.id
              },
              "Dashboard host summary refresh failed"
            );
          } finally {
            lastHostSummaryAt = Date.now();
          }

          return hostSummaryCache;
        };

        const pollNow = async () => {
          if (stopped || inFlight) {
            return;
          }

          inFlight = true;

          try {
            const runtime = await readPm2RuntimeProcesses(host);
            await refreshHostSummary();

            for (const target of payload.targets) {
              const process = runtime.processes.find((item) => item.pmId === target.pmId);

              if (process && !restartBaseline.has(process.pmId)) {
                restartBaseline.set(process.pmId, process.restartCount);
              }
            }

            const snapshot = buildDashboardSnapshot({
              hostId: host.id,
              fingerprint: runtime.fingerprint,
              host: hostSummaryCache,
              processes: runtime.processes,
              targets: payload.targets,
              restartBaseline
            });

            socket.emit("dashboard:snapshot", snapshot);
            socket.emit("dashboard:status", {
              state: "streaming",
              fingerprint: snapshot.fingerprint,
              processCount: snapshot.processes.length,
              missingTargetPmIds: snapshot.selection.missingTargetPmIds
            });
          } catch (error) {
            const appError = toAppError(error, "DASHBOARD_POLL_FAILED", "Unable to refresh the PM2 dashboard.");

            logger.warn(
              {
                error: appError,
                userId: user.userId,
                hostId: host.id
              },
              "Dashboard poll failed"
            );

            socket.emit("dashboard:error", {
              code: appError.code,
              message: appError.message,
              details: appError.details
            });
            socket.emit("dashboard:status", {
              state: "error"
            });
          } finally {
            inFlight = false;
          }
        };

        const stop = () => {
          if (stopped) {
            return;
          }

          stopped = true;

          if (interval) {
            clearInterval(interval);
            interval = null;
          }

          socket.emit("dashboard:status", {
            state: "stopped"
          });
        };

        activeDashboardSessions.set(socket.id, {
          stop,
          pollNow
        });

        socket.emit("dashboard:status", {
          state: "connecting",
          processCount: payload.targets.length
        });

        await pollNow();
        interval = setInterval(() => {
          void pollNow();
        }, DASHBOARD_POLL_INTERVAL_MS);

        await writeAuditLog({
          userId: user.userId,
          action: "dashboard.stream.start",
          targetType: "ssh_host",
          targetId: host.id,
          metadata: {
            targets: payload.targets
          }
        });
      } catch (error) {
        const appError = toAppError(error, "DASHBOARD_START_FAILED", "Unable to start the PM2 dashboard.");

        logger.warn({ error: appError, userId: user.userId }, "Dashboard session failed to start");
        socket.emit("dashboard:error", {
          code: appError.code,
          message: appError.message,
          details: appError.details
        });
        socket.emit("dashboard:status", {
          state: "error"
        });
      }
    });

    socket.on("dashboard:action", async (rawPayload: unknown) => {
      let parsedPayload: z.infer<typeof dashboardActionSchema> | null = null;

      try {
        assertWorkspaceManager(user.role);
        parsedPayload = dashboardActionSchema.parse(rawPayload);

        const host = await prisma.sshHost.findUnique({
          where: { id: parsedPayload.hostId }
        });

        if (!host) {
          throw new AppError(404, "HOST_NOT_FOUND", "SSH host not found.");
        }

        const result = await runPm2Action(host, parsedPayload.action, parsedPayload.targetPmIds);

        await writeAuditLog({
          userId: user.userId,
          action: `dashboard.action.${parsedPayload.action}`,
          targetType: "ssh_host",
          targetId: host.id,
          metadata: {
            targetPmIds: parsedPayload.targetPmIds,
            output: result.output.slice(0, 400)
          }
        });

        socket.emit("dashboard:action-result", {
          success: true,
          action: parsedPayload.action,
          targetPmIds: parsedPayload.targetPmIds,
          message: `${parsedPayload.action === "restart" ? "Restarted" : "Reloaded"} ${parsedPayload.targetPmIds.length} PM2 process${parsedPayload.targetPmIds.length === 1 ? "" : "es"}.`,
          output: result.output
        });

        socket.emit("dashboard:status", {
          state: "streaming"
        });

        const current = activeDashboardSessions.get(socket.id);

        if (current) {
          await current.pollNow();
        }
      } catch (error) {
        const appError = toAppError(error, "DASHBOARD_ACTION_FAILED", "Unable to run the PM2 action.");

        logger.warn({ error: appError, userId: user.userId }, "Dashboard action failed");
        socket.emit("dashboard:error", {
          code: appError.code,
          message: appError.message,
          details: appError.details
        });

        if (parsedPayload) {
          socket.emit("dashboard:action-result", {
            success: false,
            action: parsedPayload.action,
            targetPmIds: parsedPayload.targetPmIds,
            message: appError.message
          });
        }

        socket.emit("dashboard:status", {
          state: "error"
        });
      }
    });

    socket.on("disconnect", () => {
      void stopCurrentLogStream();
      stopCurrentDashboardSession();
    });
  });

  return io;
}
