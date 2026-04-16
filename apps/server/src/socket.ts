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
import { RingBuffer } from "./utils/ring-buffer";

const logStartSchema = z.object({
  hostId: z.string().uuid(),
  processIdOrName: z.union([z.number().int(), z.string().min(1)]),
  initialLines: z.number().int().min(1).max(5000).default(200)
});

type ActiveStream = {
  stop: () => Promise<void>;
};

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

    const stopCurrentStream = async () => {
      const current = activeStreams.get(socket.id);

      if (!current) {
        return;
      }

      activeStreams.delete(socket.id);
      await current.stop();
    };

    socket.on("logs:stop", () => {
      void stopCurrentStream().then(() => {
        socket.emit("logs:status", { state: "stopped" });
      });
    });

    socket.on("logs:start", async (rawPayload: unknown) => {
      try {
        const payload = logStartSchema.parse(rawPayload);
        await stopCurrentStream();

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
        }>(env.LOG_BUFFER_MAX_LINES);

        let sequence = 0;
        let leftoverStdout = "";
        let leftoverStderr = "";

        const stream = await createLogStream(host, payload.processIdOrName, payload.initialLines);

        const emitLine = (line: string, source: "stdout" | "stderr") => {
          const entry = {
            sequence: ++sequence,
            line,
            source,
            timestamp: new Date().toISOString()
          };

          logBuffer.push(entry);
          socket.emit("logs:line", entry);
        };

        const splitAndEmit = (
          chunk: string,
          current: string,
          source: "stdout" | "stderr"
        ): string => {
          const combined = current + chunk;
          const parts = combined.split(/\r?\n/);
          const remainder = parts.pop() ?? "";

          for (const line of parts) {
            if (line.trim().length === 0) {
              continue;
            }

            emitLine(line, source);
          }

          return remainder;
        };

        stream.stream.on("data", (chunk: string) => {
          leftoverStdout = splitAndEmit(chunk, leftoverStdout, "stdout");
        });

        stream.stream.stderr.on("data", (chunk: string) => {
          leftoverStderr = splitAndEmit(chunk, leftoverStderr, "stderr");
        });

        stream.stream.on("close", () => {
          if (leftoverStdout.trim()) {
            emitLine(leftoverStdout.trim(), "stdout");
          }

          if (leftoverStderr.trim()) {
            emitLine(leftoverStderr.trim(), "stderr");
          }

          socket.emit("logs:status", {
            state: "stopped",
            fingerprint: stream.fingerprint,
            bufferedLines: logBuffer.values().length
          });
        });

        activeStreams.set(socket.id, {
          stop: stream.stop
        });

        socket.emit("logs:status", {
          state: "streaming",
          fingerprint: stream.fingerprint,
          processIdOrName: payload.processIdOrName,
          bufferedLines: logBuffer.values().length
        });

        await writeAuditLog({
          userId: user.userId,
          action: "logs.stream.start",
          targetType: "ssh_host",
          targetId: host.id,
          metadata: {
            processIdOrName: payload.processIdOrName,
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

