import type { Request } from "express";

export function getRequestIp(request: Request): string | undefined {
  const forwarded = request.headers["x-forwarded-for"];

  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim();
  }

  return request.ip;
}

