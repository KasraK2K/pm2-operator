import { UserRole } from "@prisma/client";
import { type Request, Router } from "express";
import { z } from "zod";

import { DEFAULT_THEME_ID, THEME_IDS } from "../config/themes";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { writeAuditLog } from "../services/audit.service";
import {
  buildRefreshCookieOptions,
  createAccessToken,
  createAuthSession,
  getRefreshCookieName,
  hashPassword,
  revokeRefreshToken,
  rotateRefreshToken,
  verifyPassword
} from "../services/auth.service";
import {
  authenticatedUserSelect,
  loadAuthenticatedUserProfile,
  serializeAuthenticatedUser,
  updateUserTheme
} from "../services/user-preferences.service";
import { asyncHandler } from "../utils/async-handler";
import { AppError } from "../utils/app-error";
import { getRequestIp } from "../utils/http";

const authRoutes = Router();

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128)
});

const themeIdSchema = z.enum(THEME_IDS);

const settingsSchema = z.object({
  themeId: themeIdSchema
});

const profileSchema = z
  .object({
    email: z.string().email().optional(),
    currentPassword: z.string().min(8).max(128).optional(),
    newPassword: z.string().min(8).max(128).optional()
  })
  .superRefine((value, context) => {
    if (!value.email && !value.newPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["email"],
        message: "Provide an email change or a new password."
      });
    }

    if ((value.email || value.newPassword) && !value.currentPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["currentPassword"],
        message: "Current password is required."
      });
    }
  });

async function createSessionResponse(
  user: { id: string; email: string; role: UserRole; preferences?: { themeId: string } | null },
  request: Request
) {
  const session = await createAuthSession(
    { userId: user.id, email: user.email, role: user.role },
    {
      userAgent: request.headers["user-agent"],
      ipAddress: getRequestIp(request)
    }
  );

  return session;
}

authRoutes.get(
  "/bootstrap-status",
  asyncHandler(async (_request, response) => {
    const owner = await prisma.user.findFirst({
      where: { role: UserRole.OWNER },
      select: { id: true }
    });

    response.json({ ownerExists: Boolean(owner) });
  })
);

authRoutes.post(
  "/bootstrap",
  asyncHandler(async (request, response) => {
    const body = credentialsSchema.parse(request.body);
    const [owner, userCount] = await Promise.all([
      prisma.user.findFirst({
        where: { role: UserRole.OWNER },
        select: { id: true }
      }),
      prisma.user.count()
    ]);

    if (owner || userCount > 0) {
      throw new AppError(
        409,
        "BOOTSTRAP_COMPLETED",
        "The workspace owner has already been created. Sign in instead."
      );
    }

    const user = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash: await hashPassword(body.password),
        role: UserRole.OWNER,
        preferences: {
          create: {
            themeId: DEFAULT_THEME_ID
          }
        }
      },
      select: authenticatedUserSelect
    });

    const session = await createSessionResponse(user, request);

    response.cookie(getRefreshCookieName(), session.refreshToken, buildRefreshCookieOptions());

    await writeAuditLog({
      request,
      userId: user.id,
      action: "auth.bootstrap",
      targetType: "user",
      targetId: user.id
    });

    response.status(201).json({
      user: serializeAuthenticatedUser(user),
      accessToken: session.accessToken
    });
  })
);

authRoutes.post(
  "/register",
  asyncHandler(async (_request, _response) => {
    throw new AppError(
      403,
      "PUBLIC_REGISTRATION_DISABLED",
      "Public registration is disabled. Ask an owner or admin to create your account."
    );
  })
);

authRoutes.post(
  "/login",
  asyncHandler(async (request, response) => {
    const body = credentialsSchema.parse(request.body);
    const user = await prisma.user.findUnique({
      where: { email: body.email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        role: true
      }
    });

    if (!user || !(await verifyPassword(user.passwordHash, body.password))) {
      await writeAuditLog({
        request,
        action: "auth.login.failed",
        metadata: { email: body.email }
      });
      throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
    }

    const session = await createAuthSession(
      { userId: user.id, email: user.email, role: user.role },
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
      user: await loadAuthenticatedUserProfile(user.id),
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
      user: await loadAuthenticatedUserProfile(session.user.userId),
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
    const user = await loadAuthenticatedUserProfile(request.auth!.userId);

    response.json({ user });
  })
);

authRoutes.patch(
  "/settings",
  requireAuth,
  asyncHandler(async (request, response) => {
    const body = settingsSchema.parse(request.body);
    const user = await updateUserTheme(request.auth!.userId, body.themeId);

    await writeAuditLog({
      request,
      userId: request.auth!.userId,
      action: "auth.settings.update",
      targetType: "user",
      targetId: request.auth!.userId,
      metadata: {
        themeId: body.themeId
      }
    });

    response.json({ user });
  })
);

authRoutes.patch(
  "/settings/profile",
  requireAuth,
  asyncHandler(async (request, response) => {
    const body = profileSchema.parse(request.body);
    const currentUser = await prisma.user.findUnique({
      where: { id: request.auth!.userId },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        role: true
      }
    });

    if (!currentUser) {
      throw new AppError(404, "USER_NOT_FOUND", "Authenticated user was not found.");
    }

    if (!(await verifyPassword(currentUser.passwordHash, body.currentPassword!))) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Current password is incorrect.");
    }

    const nextEmail = body.email?.trim();

    if (nextEmail && nextEmail !== currentUser.email) {
      const existing = await prisma.user.findUnique({
        where: { email: nextEmail },
        select: { id: true }
      });

      if (existing) {
        throw new AppError(409, "EMAIL_IN_USE", "Email is already registered.");
      }
    }

    const updated = await prisma.user.update({
      where: { id: currentUser.id },
      data: {
        email: nextEmail && nextEmail !== currentUser.email ? nextEmail : undefined,
        passwordHash: body.newPassword ? await hashPassword(body.newPassword) : undefined
      },
      select: {
        id: true,
        email: true,
        role: true
      }
    });

    const user = await loadAuthenticatedUserProfile(updated.id);
    const accessToken = createAccessToken({
      userId: updated.id,
      email: updated.email,
      role: updated.role
    });

    await writeAuditLog({
      request,
      userId: updated.id,
      action: "auth.profile.update",
      targetType: "user",
      targetId: updated.id,
      metadata: {
        emailChanged: Boolean(nextEmail && nextEmail !== currentUser.email),
        passwordChanged: Boolean(body.newPassword)
      }
    });

    response.json({ user, accessToken });
  })
);

export { authRoutes };
