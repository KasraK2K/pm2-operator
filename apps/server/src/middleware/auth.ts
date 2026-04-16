import type { NextFunction, Request, Response } from "express";

import { verifyAccessToken } from "../services/auth.service";
import { AppError } from "../utils/app-error";

export function requireAuth(request: Request, _response: Response, next: NextFunction) {
  const rawHeader = request.headers.authorization;

  if (!rawHeader?.startsWith("Bearer ")) {
    next(new AppError(401, "UNAUTHORIZED", "Missing bearer token."));
    return;
  }

  try {
    const token = rawHeader.slice("Bearer ".length);
    const payload = verifyAccessToken(token);
    request.auth = {
      userId: payload.userId,
      email: payload.email
    };
    next();
  } catch {
    next(new AppError(401, "UNAUTHORIZED", "Access token is invalid or expired."));
  }
}

