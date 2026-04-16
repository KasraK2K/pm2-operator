import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { writeAuditLog } from "../services/audit.service";
import {
  buildRefreshCookieOptions,
  createAuthSession,
  getRefreshCookieName,
  hashPassword,
  revokeRefreshToken,
  rotateRefreshToken,
  verifyPassword
} from "../services/auth.service";
import { asyncHandler } from "../utils/async-handler";
import { AppError } from "../utils/app-error";
import { getRequestIp } from "../utils/http";

const authRoutes = Router();

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128)
});

authRoutes.post(
  "/register",
  asyncHandler(async (request, response) => {
    const body = credentialsSchema.parse(request.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email } });

    if (existing) {
      throw new AppError(409, "EMAIL_IN_USE", "Email is already registered.");
    }

    const user = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash: await hashPassword(body.password)
      }
    });

    const session = await createAuthSession(
      { userId: user.id, email: user.email },
      {
        userAgent: request.headers["user-agent"],
        ipAddress: getRequestIp(request)
      }
    );

    response.cookie(getRefreshCookieName(), session.refreshToken, buildRefreshCookieOptions());

    await writeAuditLog({
      request,
      userId: user.id,
      action: "auth.register",
      targetType: "user",
      targetId: user.id
    });

    response.status(201).json({
      user: { id: user.id, email: user.email },
      accessToken: session.accessToken
    });
  })
);

authRoutes.post(
  "/login",
  asyncHandler(async (request, response) => {
    const body = credentialsSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });

    if (!user || !(await verifyPassword(user.passwordHash, body.password))) {
      await writeAuditLog({
        request,
        action: "auth.login.failed",
        metadata: { email: body.email }
      });
      throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
    }

    const session = await createAuthSession(
      { userId: user.id, email: user.email },
      {
        userAgent: request.headers["user-agent"],
        ipAddress: getRequestIp(request)
      }
    );

    response.cookie(getRefreshCookieName(), session.refreshToken, buildRefreshCookieOptions());

    await writeAuditLog({
      request,
      userId: user.id,
      action: "auth.login",
      targetType: "user",
      targetId: user.id
    });

    response.json({
      user: { id: user.id, email: user.email },
      accessToken: session.accessToken
    });
  })
);

authRoutes.post(
  "/refresh",
  asyncHandler(async (request, response) => {
    const refreshToken = request.cookies[getRefreshCookieName()] as string | undefined;

    if (!refreshToken) {
      throw new AppError(401, "MISSING_REFRESH_TOKEN", "Refresh token cookie is missing.");
    }

    const session = await rotateRefreshToken(refreshToken, {
      userAgent: request.headers["user-agent"],
      ipAddress: getRequestIp(request)
    });

    response.cookie(getRefreshCookieName(), session.refreshToken, buildRefreshCookieOptions());

    response.json({
      user: { id: session.user.userId, email: session.user.email },
      accessToken: session.accessToken
    });
  })
);

authRoutes.post(
  "/logout",
  asyncHandler(async (request, response) => {
    const refreshToken = request.cookies[getRefreshCookieName()] as string | undefined;

    await revokeRefreshToken(refreshToken);
    response.clearCookie(getRefreshCookieName(), buildRefreshCookieOptions());

    if (request.auth?.userId) {
      await writeAuditLog({
        request,
        action: "auth.logout",
        targetType: "user",
        targetId: request.auth.userId
      });
    }

    response.status(204).send();
  })
);

authRoutes.get(
  "/me",
  requireAuth,
  asyncHandler(async (request, response) => {
    const user = await prisma.user.findUnique({
      where: { id: request.auth!.userId },
      select: { id: true, email: true }
    });

    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "Authenticated user was not found.");
    }

    response.json({ user });
  })
);

export { authRoutes };

