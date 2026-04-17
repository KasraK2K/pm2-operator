import type { Prisma, UserRole } from "@prisma/client";

import { DEFAULT_THEME_ID, isThemeId, type ThemeId } from "../config/themes";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/app-error";

export interface UserSettings {
  themeId: ThemeId;
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
      themeId: true
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
      themeId: true
    }
  }
} satisfies Prisma.UserSelect;

type SerializedUserInput = {
  id: string;
  email: string;
  role: UserRole;
  preferences?: { themeId: string } | null;
};

function normalizeThemeId(themeId: string | null | undefined): ThemeId {
  return isThemeId(themeId) ? themeId : DEFAULT_THEME_ID;
}

function serializeUserSettings(preferences?: { themeId: string } | null): UserSettings {
  return {
    themeId: normalizeThemeId(preferences?.themeId)
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
      themeId: DEFAULT_THEME_ID
    }
  });

  if (isThemeId(preferences.themeId)) {
    return preferences;
  }

  return prisma.userPreference.update({
    where: { userId },
    data: {
      themeId: DEFAULT_THEME_ID
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

export async function updateUserTheme(userId: string, themeId: ThemeId): Promise<AuthenticatedUserProfile> {
  const [preferences, user] = await Promise.all([
    prisma.userPreference.upsert({
      where: { userId },
      update: { themeId },
      create: {
        userId,
        themeId
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
