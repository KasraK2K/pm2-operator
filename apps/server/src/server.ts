import http from "http";
import path from "path";

import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { prisma } from "./lib/prisma";
import { createSocketServer } from "./socket";

const frontendDir = path.resolve(__dirname, "../../web/dist");
const app = createApp({ frontendDir });
const server = http.createServer(app);

createSocketServer(server);

async function main() {
  await prisma.$connect();

  server.listen(env.APP_PORT, () => {
    logger.info({ port: env.APP_PORT }, "PM2 Operator server started");
  });
}

main().catch((error) => {
  logger.error({ error }, "Failed to start server");
  process.exit(1);
});

const shutdown = async () => {
  await prisma.$disconnect();
  server.close(() => {
    process.exit(0);
  });
};

process.on("SIGTERM", () => {
  void shutdown();
});

process.on("SIGINT", () => {
  void shutdown();
});
