import type { Prisma, UserRole } from "@prisma/client";

import { DEFAULT_THEME_ID, isThemeId, type ThemeId } from "../config/themes";
import { DEFAULT_SHORTCUTS, SHORTCUT_ACTIONS, type ShortcutMap } from "../config/shortcuts";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/app-error";

export interface UserSettings {
  themeId: ThemeId;
  panelLayout: Record<string, boolean>;
  shortcuts: ShortcutMap;
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
      panelLayout: true,
      shortcuts: true
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
      panelLayout: true,
      shortcuts: true
    }
  }
} satisfies Prisma.UserSelect;

type SerializedUserInput = {
  id: string;
  email: string;
  role: UserRole;
  preferences?: {
    themeId: string;
    panelLayout?: Prisma.JsonValue | null;
    shortcuts?: Prisma.JsonValue | null;
  } | null;
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

function normalizeShortcuts(shortcuts: Prisma.JsonValue | null | undefined): ShortcutMap {
  if (!shortcuts || typeof shortcuts !== "object" || Array.isArray(shortcuts)) {
    return DEFAULT_SHORTCUTS;
  }

  return Object.fromEntries(
    SHORTCUT_ACTIONS.map((action) => {
      const value = (shortcuts as Record<string, unknown>)[action];
      return [action, typeof value === "string" && value.trim() ? value.trim() : DEFAULT_SHORTCUTS[action]];
    })
  ) as ShortcutMap;
}

function serializeUserSettings(
  preferences?: {
    themeId: string;
    panelLayout?: Prisma.JsonValue | null;
    shortcuts?: Prisma.JsonValue | null;
  } | null
): UserSettings {
  return {
    themeId: normalizeThemeId(preferences?.themeId),
    panelLayout: normalizePanelLayout(preferences?.panelLayout),
    shortcuts: normalizeShortcuts(preferences?.shortcuts)
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
      panelLayout: {},
      shortcuts: DEFAULT_SHORTCUTS
    }
  });

  if (isThemeId(preferences.themeId)) {
    return preferences;
  }

  return prisma.userPreference.update({
    where: { userId },
    data: {
      themeId: DEFAULT_THEME_ID,
      panelLayout: normalizePanelLayout(preferences.panelLayout),
      shortcuts: normalizeShortcuts(preferences.shortcuts)
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
  settings: { themeId?: ThemeId; panelLayout?: Record<string, boolean>; shortcuts?: ShortcutMap }
): Promise<AuthenticatedUserProfile> {
  const [preferences, user] = await Promise.all([
    prisma.userPreference.upsert({
      where: { userId },
      update: {
        themeId: settings.themeId,
        panelLayout: settings.panelLayout,
        shortcuts: settings.shortcuts
      },
      create: {
        userId,
        themeId: settings.themeId ?? DEFAULT_THEME_ID,
        panelLayout: settings.panelLayout ?? {},
        shortcuts: settings.shortcuts ?? DEFAULT_SHORTCUTS
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
