import fs from "fs";
import path from "path";

import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";

import { env } from "./config/env";
import { logger } from "./lib/logger";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { authRoutes } from "./routes/auth.routes";
import { hostRoutes } from "./routes/hosts.routes";
import { tagRoutes } from "./routes/tags.routes";
import { userRoutes } from "./routes/users.routes";

export function createApp(options?: { frontendDir?: string }) {
  const app = express();

  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger }));

  app.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.use("/auth", authRoutes);
  app.use("/hosts", hostRoutes);
  app.use("/tags", tagRoutes);
  app.use("/users", userRoutes);

  if (options?.frontendDir) {
    const indexPath = path.join(options.frontendDir, "index.html");

    if (fs.existsSync(indexPath)) {
      app.use(express.static(options.frontendDir));
      app.get("*", (request, response, next) => {
        if (
          request.path.startsWith("/auth") ||
          request.path.startsWith("/hosts") ||
          request.path.startsWith("/tags") ||
          request.path.startsWith("/users") ||
          request.path.startsWith("/health") ||
          request.path.startsWith("/socket.io")
        ) {
          next();
          return;
        }

        response.sendFile(indexPath);
      });
    }
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
