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

const defaultShortcuts = {
  processes: "Alt+P",
  dashboard: "Alt+D",
  logs: "Alt+L",
  clearLogs: "Mod+K"
};

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
          themeId: "midnight-ops",
          panelLayout: {},
          shortcuts: defaultShortcuts
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
        themeId: "graphite",
        panelLayout: {},
        shortcuts: defaultShortcuts
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
        themeId: "ocean-depth",
        panelLayout: {},
        shortcuts: defaultShortcuts
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
        themeId: "terminal-green",
        panelLayout: {},
        shortcuts: defaultShortcuts
      }
    });
  });

  it("updates the authenticated user's theme", async () => {
    prismaMock.userPreference.upsert.mockResolvedValueOnce({
      userId: "user-1",
      themeId: "signal-neon",
      panelLayout: {}
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
    expect(response.body.user.settings.panelLayout).toEqual({});
    expect(response.body.user.settings.shortcuts).toEqual(defaultShortcuts);
  });

  it("updates the authenticated user's shortcuts", async () => {
    const shortcuts = {
      processes: "Alt+1",
      dashboard: "Alt+2",
      logs: "Alt+3",
      clearLogs: "Mod+Shift+K"
    };

    prismaMock.userPreference.upsert.mockResolvedValueOnce({
      userId: "user-1",
      themeId: "midnight-ops",
      panelLayout: {},
      shortcuts
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
      .send({ shortcuts });

    expect(response.status).toBe(200);
    expect(response.body.user.settings).toEqual({
      themeId: "midnight-ops",
      panelLayout: {},
      shortcuts
    });
  });

  it("updates the authenticated user's panel layout", async () => {
    prismaMock.userPreference.upsert.mockResolvedValueOnce({
      userId: "user-1",
      themeId: "midnight-ops",
      panelLayout: {
        "dashboard-kpi-strip": true,
        "embedded-log-panel": false
      }
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
        panelLayout: {
          "dashboard-kpi-strip": true,
          "embedded-log-panel": false
        }
      });

    expect(response.status).toBe(200);
    expect(response.body.user.settings).toEqual({
      themeId: "midnight-ops",
      panelLayout: {
        "dashboard-kpi-strip": true,
        "embedded-log-panel": false
      },
      shortcuts: defaultShortcuts
    });
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
          themeId: "midnight-ops",
          panelLayout: {},
          shortcuts: defaultShortcuts
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
