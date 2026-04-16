import { createHash, randomBytes, randomUUID } from "crypto";

import argon2 from "argon2";
import jwt from "jsonwebtoken";

import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/app-error";

const REFRESH_COOKIE_NAME = "pm2lv_refresh";

export interface AuthUser {
  userId: string;
  email: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getRefreshCookieName() {
  return REFRESH_COOKIE_NAME;
}

export function buildRefreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.COOKIE_SECURE,
    path: "/auth",
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000
  };
}

export async function hashPassword(password: string) {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password);
}

export function createAccessToken(payload: AuthUser) {
  return jwt.sign(
    {
      email: payload.email
    },
    env.JWT_ACCESS_SECRET,
    {
      subject: payload.userId,
      expiresIn: `${env.ACCESS_TOKEN_TTL_MINUTES}m`
    }
  );
}

export function verifyAccessToken(token: string): AuthUser {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);

  if (
    typeof decoded !== "object" ||
    typeof decoded.sub !== "string" ||
    typeof decoded.email !== "string"
  ) {
    throw new AppError(401, "INVALID_TOKEN", "Invalid access token.");
  }

  return {
    userId: decoded.sub,
    email: decoded.email
  };
}

async function persistRefreshToken(
  userId: string,
  family: string,
  token: string,
  context?: { userAgent?: string; ipAddress?: string }
) {
  await prisma.refreshToken.create({
    data: {
      userId,
      family,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
      userAgent: context?.userAgent,
      ipAddress: context?.ipAddress
    }
  });
}

export async function createAuthSession(
  user: AuthUser,
  context?: { userAgent?: string; ipAddress?: string }
): Promise<AuthSession> {
  const refreshToken = randomBytes(48).toString("hex");
  const family = randomUUID();

  await persistRefreshToken(user.userId, family, refreshToken, context);

  return {
    accessToken: createAccessToken(user),
    refreshToken
  };
}

export async function rotateRefreshToken(
  refreshToken: string,
  context?: { userAgent?: string; ipAddress?: string }
): Promise<AuthSession & { user: AuthUser }> {
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
    include: { user: true }
  });

  if (!existing || existing.revokedAt || existing.expiresAt.getTime() < Date.now()) {
    throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired.");
  }

  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: {
      revokedAt: new Date(),
      lastUsedAt: new Date()
    }
  });

  const nextRefreshToken = randomBytes(48).toString("hex");

  await persistRefreshToken(existing.userId, existing.family, nextRefreshToken, context);

  const user = {
    userId: existing.user.id,
    email: existing.user.email
  };

  return {
    user,
    accessToken: createAccessToken(user),
    refreshToken: nextRefreshToken
  };
}

export async function revokeRefreshToken(refreshToken: string | undefined) {
  if (!refreshToken) {
    return;
  }

  await prisma.refreshToken.updateMany({
    where: {
      tokenHash: hashToken(refreshToken),
      revokedAt: null
    },
    data: {
      revokedAt: new Date()
    }
  });
}

