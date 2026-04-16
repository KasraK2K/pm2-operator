import type { Request } from "express";

import { prisma } from "../lib/prisma";
import { getRequestIp } from "../utils/http";

interface AuditOptions {
  request?: Request;
  userId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: unknown;
}

export async function writeAuditLog(options: AuditOptions) {
  await prisma.auditLog.create({
    data: {
      userId: options.userId ?? options.request?.auth?.userId ?? null,
      action: options.action,
      targetType: options.targetType,
      targetId: options.targetId,
      metadata: options.metadata as object | undefined,
      ipAddress: options.request ? getRequestIp(options.request) : undefined,
      userAgent: options.request?.headers["user-agent"]
    }
  });
}

