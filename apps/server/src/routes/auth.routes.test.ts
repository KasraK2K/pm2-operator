import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: {
    count: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn()
  },
  userPreference: {
    upsert: vi.fn(),
    update: vi.fn()
  },
  refreshToken: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn()
  },
  auditLog: {
    create: vi.fn()
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
  createAccessToken: vi.fn(() => "updated-access-token"),
  createAuthSession: vi.fn(),
  getRefreshCookieName: vi.fn(() => "pm2lv_refresh"),
  hashPassword: vi.fn(),
  revokeRefreshToken: vi.fn(),
  rotateRefreshToken: vi.fn(),
  verifyPassword: vi.fn(),
  verifyAccessToken: vi.fn()
}));

vi.mock("../lib/prisma", () => ({
  prisma: prismaMock
}));

vi.mock("../services/auth.service", () => authServiceMock);

import { createApp } from "../app";

describe("auth.routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock.user.count.mockResolvedValue(0);
    prismaMock.user.findFirst.mockResolvedValue(null);
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
        email: "owner@example.com",
        role: "OWNER"
      }
    });
    authServiceMock.verifyPassword.mockResolvedValue(true);
    authServiceMock.verifyAccessToken.mockReturnValue({
      userId: "user-1",
      email: "owner@example.com",
      role: "OWNER"
    });
  });

  it("reports bootstrap status before the owner exists", async () => {
    const app = createApp();
    const response = await request(app).get("/auth/bootstrap-status");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ownerExists: false });
  });

  it("creates the owner during bootstrap", async () => {
    prismaMock.user.create.mockResolvedValueOnce({
      id: "user-1",
      email: "owner@example.com",
      role: "OWNER",
      preferences: {
        themeId: "midnight-ops"
      }
    });

    const app = createApp();
    const response = await request(app).post("/auth/bootstrap").send({
      email: "owner@example.com",
      password: "super-secret"
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      user: {
        id: "user-1",
        email: "owner@example.com",
        role: "OWNER",
        settings: {
          themeId: "midnight-ops"
        }
      },
      accessToken: "access-token"
    });
  });

  it("blocks public registration", async () => {
    const app = createApp();
    const response = await request(app).post("/auth/register").send({
      email: "owner@example.com",
      password: "super-secret"
    });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("PUBLIC_REGISTRATION_DISABLED");
  });

  it("returns persisted role and theme on login", async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce({
        id: "user-1",
        email: "owner@example.com",
        passwordHash: "hashed-password",
        role: "OWNER"
      })
      .mockResolvedValueOnce({
        id: "user-1",
        email: "owner@example.com",
        role: "OWNER",
        preferences: {
          themeId: "graphite"
        }
      });

    const app = createApp();
    const response = await request(app).post("/auth/login").send({
      email: "owner@example.com",
      password: "super-secret"
    });

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({
      id: "user-1",
      email: "owner@example.com",
      role: "OWNER",
      settings: {
        themeId: "graphite"
      }
    });
  });

  it("returns role and theme on refresh", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      email: "owner@example.com",
      role: "OWNER",
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
      email: "owner@example.com",
      role: "OWNER",
      settings: {
        themeId: "ocean-depth"
      }
    });
  });

  it("returns role and theme on me", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      email: "owner@example.com",
      role: "OWNER",
      preferences: {
        themeId: "terminal-green"
      }
    });

    const app = createApp();
    const response = await request(app)
      .get("/auth/me")
      .set("Authorization", "Bearer access-token");

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({
      id: "user-1",
      email: "owner@example.com",
      role: "OWNER",
      settings: {
        themeId: "terminal-green"
      }
    });
  });

  it("updates the authenticated user's theme", async () => {
    prismaMock.userPreference.upsert.mockResolvedValueOnce({
      userId: "user-1",
      themeId: "signal-neon"
    });
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      email: "owner@example.com",
      role: "OWNER"
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
  });

  it("updates the authenticated user's profile and returns a refreshed access token", async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce({
        id: "user-1",
        email: "owner@example.com",
        passwordHash: "hashed-password",
        role: "OWNER"
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "user-1",
        email: "lead@example.com",
        role: "OWNER",
        preferences: {
          themeId: "midnight-ops"
        }
      });
    prismaMock.user.update.mockResolvedValueOnce({
      id: "user-1",
      email: "lead@example.com",
      role: "OWNER"
    });

    const app = createApp();
    const response = await request(app)
      .patch("/auth/settings/profile")
      .set("Authorization", "Bearer access-token")
      .send({
        email: "lead@example.com",
        currentPassword: "super-secret",
        newPassword: "new-secret-123"
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      user: {
        id: "user-1",
        email: "lead@example.com",
        role: "OWNER",
        settings: {
          themeId: "midnight-ops"
        }
      },
      accessToken: "updated-access-token"
    });
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
