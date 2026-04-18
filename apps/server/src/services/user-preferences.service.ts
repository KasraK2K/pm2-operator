import type { Prisma, UserRole } from "@prisma/client";

import { DEFAULT_THEME_ID, isThemeId, type ThemeId } from "../config/themes";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/app-error";

export interface UserSettings {
  themeId: ThemeId;
  panelLayout: Record<string, boolean>;
}

export interface AuthenticatedUserProfile {
  id: string;
  email: string;
  role: UserRole;
  settings: UserSettings;
}

export interface ManagedUserProfile extends AuthenticatedUserProfile {
  createdAt: Date;
  updatedAt: Date;
}

export const authenticatedUserSelect = {
  id: true,
  email: true,
  role: true,
  preferences: {
    select: {
      themeId: true,
      panelLayout: true
    }
  }
} satisfies Prisma.UserSelect;

export const managedUserSelect = {
  id: true,
  email: true,
  role: true,
  createdAt: true,
  updatedAt: true,
  preferences: {
    select: {
      themeId: true,
      panelLayout: true
    }
  }
} satisfies Prisma.UserSelect;

type SerializedUserInput = {
  id: string;
  email: string;
  role: UserRole;
  preferences?: { themeId: string; panelLayout?: Prisma.JsonValue | null } | null;
};

function normalizeThemeId(themeId: string | null | undefined): ThemeId {
  return isThemeId(themeId) ? themeId : DEFAULT_THEME_ID;
}

function normalizePanelLayout(panelLayout: Prisma.JsonValue | null | undefined) {
  if (!panelLayout || typeof panelLayout !== "object" || Array.isArray(panelLayout)) {
    return {} as Record<string, boolean>;
  }

  return Object.fromEntries(
    Object.entries(panelLayout).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean")
  );
}

function serializeUserSettings(
  preferences?: { themeId: string; panelLayout?: Prisma.JsonValue | null } | null
): UserSettings {
  return {
    themeId: normalizeThemeId(preferences?.themeId),
    panelLayout: normalizePanelLayout(preferences?.panelLayout)
  };
}

export function serializeAuthenticatedUser(user: SerializedUserInput): AuthenticatedUserProfile {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    settings: serializeUserSettings(user.preferences)
  };
}

export function serializeManagedUser(
  user: SerializedUserInput & { createdAt: Date; updatedAt: Date }
): ManagedUserProfile {
  return {
    ...serializeAuthenticatedUser(user),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

export async function ensureUserPreferences(userId: string) {
  const preferences = await prisma.userPreference.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      themeId: DEFAULT_THEME_ID,
      panelLayout: {}
    }
  });

  if (isThemeId(preferences.themeId)) {
    return preferences;
  }

  return prisma.userPreference.update({
    where: { userId },
    data: {
      themeId: DEFAULT_THEME_ID,
      panelLayout: normalizePanelLayout(preferences.panelLayout)
    }
  });
}

export async function loadAuthenticatedUserProfile(userId: string): Promise<AuthenticatedUserProfile> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: authenticatedUserSelect
  });

  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "Authenticated user was not found.");
  }

  if (user.preferences && isThemeId(user.preferences.themeId)) {
    return serializeAuthenticatedUser(user);
  }

  const preferences = await ensureUserPreferences(userId);
  return serializeAuthenticatedUser({
    ...user,
    preferences
  });
}

export async function loadManagedUsers(): Promise<ManagedUserProfile[]> {
  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: managedUserSelect
  });

  const usersWithPreferences = await Promise.all(
    users.map(async (user) => {
      if (user.preferences && isThemeId(user.preferences.themeId)) {
        return user;
      }

      const preferences = await ensureUserPreferences(user.id);
      return {
        ...user,
        preferences
      };
    })
  );

  return usersWithPreferences.map(serializeManagedUser);
}

export async function updateUserSettings(
  userId: string,
  settings: { themeId?: ThemeId; panelLayout?: Record<string, boolean> }
): Promise<AuthenticatedUserProfile> {
  const [preferences, user] = await Promise.all([
    prisma.userPreference.upsert({
      where: { userId },
      update: {
        themeId: settings.themeId,
        panelLayout: settings.panelLayout
      },
      create: {
        userId,
        themeId: settings.themeId ?? DEFAULT_THEME_ID,
        panelLayout: settings.panelLayout ?? {}
      }
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true
      }
    })
  ]);

  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "Authenticated user was not found.");
  }

  return serializeAuthenticatedUser({
    ...user,
    preferences
  });
}
