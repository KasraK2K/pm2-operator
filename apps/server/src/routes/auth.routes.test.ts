import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    create: vi.fn()
  },
  userPreference: {
    upsert: vi.fn(),
    update: vi.fn()
  }
}));

const authServiceMock = vi.hoisted(() => ({
  buildRefreshCookieOptions: vi.fn(() => ({
    httpOnly: true,
    sameSite: "lax" as const,
    secure: false,
    path: "/auth",
    maxAge: 1_000
  })),
  createAuthSession: vi.fn(),
  getRefreshCookieName: vi.fn(() => "pm2lv_refresh"),
  hashPassword: vi.fn(),
  revokeRefreshToken: vi.fn(),
  rotateRefreshToken: vi.fn(),
  verifyPassword: vi.fn(),
  verifyAccessToken: vi.fn()
}));

const auditLogMock = vi.hoisted(() => ({
  writeAuditLog: vi.fn()
}));

vi.mock("../lib/prisma", () => ({
  prisma: prismaMock
}));

vi.mock("../services/auth.service", () => authServiceMock);

vi.mock("../services/audit.service", () => auditLogMock);

import { createApp } from "../app";

describe("auth.routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    authServiceMock.hashPassword.mockResolvedValue("hashed-password");
    authServiceMock.createAuthSession.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token"
    });
    authServiceMock.rotateRefreshToken.mockResolvedValue({
      accessToken: "rotated-access-token",
      refreshToken: "rotated-refresh-token",
      user: {
        userId: "user-1",
        email: "operator@example.com"
      }
    });
    authServiceMock.verifyPassword.mockResolvedValue(true);
    authServiceMock.verifyAccessToken.mockReturnValue({
      userId: "user-1",
      email: "operator@example.com"
    });
  });

  it("returns default theme settings on register", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    prismaMock.user.create.mockResolvedValueOnce({
      id: "user-1",
      email: "operator@example.com",
      preferences: {
        themeId: "midnight-ops"
      }
    });

    const app = createApp();
    const response = await request(app).post("/auth/register").send({
      email: "operator@example.com",
      password: "super-secret"
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      user: {
        id: "user-1",
        email: "operator@example.com",
        settings: {
          themeId: "midnight-ops"
        }
      },
      accessToken: "access-token"
    });
  });

  it("returns persisted theme settings on login", async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce({
        id: "user-1",
        email: "operator@example.com",
        passwordHash: "hashed-password"
      })
      .mockResolvedValueOnce({
        id: "user-1",
        email: "operator@example.com",
        preferences: {
          themeId: "graphite"
        }
      });

    const app = createApp();
    const response = await request(app).post("/auth/login").send({
      email: "operator@example.com",
      password: "super-secret"
    });

    expect(response.status).toBe(200);
    expect(response.body.user.settings.themeId).toBe("graphite");
  });

  it("returns theme settings on refresh", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      email: "operator@example.com",
      preferences: {
        themeId: "ocean-depth"
      }
    });

    const app = createApp();
    const response = await request(app)
      .post("/auth/refresh")
      .set("Cookie", "pm2lv_refresh=refresh-token");

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({
      id: "user-1",
      email: "operator@example.com",
      settings: {
        themeId: "ocean-depth"
      }
    });
  });

  it("returns theme settings on me", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      email: "operator@example.com",
      preferences: {
        themeId: "terminal-green"
      }
    });

    const app = createApp();
    const response = await request(app)
      .get("/auth/me")
      .set("Authorization", "Bearer access-token");

    expect(response.status).toBe(200);
    expect(response.body.user.settings.themeId).toBe("terminal-green");
  });

  it("updates the authenticated user's theme", async () => {
    prismaMock.userPreference.upsert.mockResolvedValueOnce({
      userId: "user-1",
      themeId: "signal-neon"
    });
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      email: "operator@example.com"
    });

    const app = createApp();
    const response = await request(app)
      .patch("/auth/settings")
      .set("Authorization", "Bearer access-token")
      .send({
        themeId: "signal-neon"
      });

    expect(response.status).toBe(200);
    expect(response.body.user.settings.themeId).toBe("signal-neon");
    expect(prismaMock.userPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "user-1"
        }
      })
    );
  });

  it("rejects invalid theme ids", async () => {
    const app = createApp();
    const response = await request(app)
      .patch("/auth/settings")
      .set("Authorization", "Bearer access-token")
      .send({
        themeId: "unknown-theme"
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled();
  });
});
