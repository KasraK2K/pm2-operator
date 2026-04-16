import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __pm2LogViewerPrisma: PrismaClient | undefined;
}

export const prisma =
  global.__pm2LogViewerPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  global.__pm2LogViewerPrisma = prisma;
}

