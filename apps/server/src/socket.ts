import type { Server as HttpServer } from "http";

import { Server } from "socket.io";
import { z } from "zod";

import { env } from "./config/env";
import { logger } from "./lib/logger";
import { prisma } from "./lib/prisma";
import { writeAuditLog } from "./services/audit.service";
import { verifyAccessToken } from "./services/auth.service";
import { createLogStream } from "./services/ssh.service";
import { AppError } from "./utils/app-error";
import { stripAnsiSequences } from "./utils/pm2";
import { RingBuffer } from "./utils/ring-buffer";

const processSelectorSchema = z.union([z.number().int(), z.string().trim().min(1)]);

const logTargetSchema = z.object({
  processIdOrName: processSelectorSchema,
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

type LogTarget = z.infer<typeof logTargetSchema>;

type ActiveStream = {
  stop: () => Promise<void>;
  suppressStoppedStatus: () => void;
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

function cleanLogLine(line: string) {
  const displayLine = stripAnsiSequences(line).replace(/\r/g, "").replace(/\u0007/g, "");

  return {
    displayLine: displayLine.trimEnd(),
    normalizedLine: displayLine.trim()
  };
}

function shouldIgnoreLogLine(normalizedLine: string) {
  if (!normalizedLine) {
    return true;
  }

  if (normalizedLine.startsWith("[TAILING] Tailing last")) {
    return true;
  }

  if (/\/\.pm2\/logs\/.+ last \d+ lines:$/.test(normalizedLine)) {
    return true;
  }

  return /^[^\s@]+@[^:\s]+(?::.*)?[#>$]$/.test(normalizedLine);
}

export function createSocketServer(server: HttpServer) {
  const io = new Server(server, {
    cors: {
      origin: env.CORS_ORIGIN,
      credentials: true
    }
  });

  const activeStreams = new Map<string, ActiveStream>();

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
    const user = socket.data.user as { userId: string; email: string };

    const stopCurrentStream = async (options?: { suppressStatus?: boolean }) => {
      const current = activeStreams.get(socket.id);

      if (!current) {
        return;
      }

      if (options?.suppressStatus) {
        current.suppressStoppedStatus();
      }

      activeStreams.delete(socket.id);
      await current.stop();
    };

    socket.on("logs:stop", () => {
      void stopCurrentStream();
    });

    socket.on("logs:start", async (rawPayload: unknown) => {
      try {
        const payload = logStartSchema.parse(rawPayload);
        const targets = normalizeTargets(payload);
        await stopCurrentStream({ suppressStatus: true });

        const host = await prisma.sshHost.findFirst({
          where: { id: payload.hostId, userId: user.userId }
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

          if (activeStreams.get(socket.id)?.stop === stopStreams) {
            activeStreams.delete(socket.id);
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
          const { displayLine, normalizedLine } = cleanLogLine(line);

          if (!item.ready) {
            if (normalizedLine === item.handle.beginMarker) {
              item.ready = true;
            }

            return;
          }

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

        activeStreams.set(socket.id, {
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
        const appError =
          error instanceof AppError
            ? error
            : new AppError(400, "STREAM_START_FAILED", "Unable to start the log stream.", {
                cause: error instanceof Error ? error.message : "unknown"
              });

        logger.warn({ error: appError, userId: user.userId }, "Log stream failed to start");
        socket.emit("logs:error", {
          code: appError.code,
          message: appError.message,
          details: appError.details
        });
      }
    });

    socket.on("disconnect", () => {
      void stopCurrentStream();
    });
  });

  return io;
}
