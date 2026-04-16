import type { Prisma } from "@prisma/client";

import { DEFAULT_THEME_ID, isThemeId, type ThemeId } from "../config/themes";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/app-error";

export interface AuthenticatedUserProfile {
  id: string;
  email: string;
  settings: {
    themeId: ThemeId;
  };
}

export const authenticatedUserSelect = {
  id: true,
  email: true,
  preferences: {
    select: {
      themeId: true
    }
  }
} satisfies Prisma.UserSelect;

function normalizeThemeId(themeId: string | null | undefined): ThemeId {
  return isThemeId(themeId) ? themeId : DEFAULT_THEME_ID;
}

export function serializeAuthenticatedUser(user: {
  id: string;
  email: string;
  preferences?: { themeId: string } | null;
}): AuthenticatedUserProfile {
  return {
    id: user.id,
    email: user.email,
    settings: {
      themeId: normalizeThemeId(user.preferences?.themeId)
    }
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
        email: true
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
