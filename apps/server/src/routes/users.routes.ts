import { UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { DEFAULT_THEME_ID } from "../config/themes";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { writeAuditLog } from "../services/audit.service";
import { assertUserManager } from "../services/authorization.service";
import { hashPassword } from "../services/auth.service";
import {
  loadManagedUsers,
  managedUserSelect,
  serializeManagedUser
} from "../services/user-preferences.service";
import { asyncHandler } from "../utils/async-handler";
import { AppError } from "../utils/app-error";

const userRoutes = Router();

const manageableRoleSchema = z.enum([UserRole.ADMIN, UserRole.MEMBER]);

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  role: manageableRoleSchema
});

const updateUserSchema = z
  .object({
    email: z.string().email().optional(),
    password: z.string().min(8).max(128).optional(),
    role: manageableRoleSchema.optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required."
  });

userRoutes.use(requireAuth);

userRoutes.get(
  "/",
  asyncHandler(async (request, response) => {
    assertUserManager(request.auth!.role);

    response.json({
      users: await loadManagedUsers()
    });
  })
);

userRoutes.post(
  "/",
  asyncHandler(async (request, response) => {
    assertUserManager(request.auth!.role);

    const body = createUserSchema.parse(request.body);
    const existing = await prisma.user.findUnique({
      where: { email: body.email },
      select: { id: true }
    });

    if (existing) {
      throw new AppError(409, "EMAIL_IN_USE", "Email is already registered.");
    }

    const user = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash: await hashPassword(body.password),
        role: body.role,
        preferences: {
          create: {
            themeId: DEFAULT_THEME_ID
          }
        }
      },
      select: managedUserSelect
    });

    await writeAuditLog({
      request,
      action: "user.create",
      targetType: "user",
      targetId: user.id,
      metadata: {
        role: user.role
      }
    });

    response.status(201).json({ user: serializeManagedUser(user) });
  })
);

userRoutes.patch(
  "/:id",
  asyncHandler(async (request, response) => {
    assertUserManager(request.auth!.role);

    const userId = z.string().parse(request.params.id);
    const body = updateUserSchema.parse(request.body);
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true
      }
    });

    if (!existing) {
      throw new AppError(404, "USER_NOT_FOUND", "User not found.");
    }

    if (existing.role === UserRole.OWNER && request.auth!.role !== UserRole.OWNER) {
      throw new AppError(403, "FORBIDDEN", "Admins cannot modify the owner account.");
    }

    if (existing.role === UserRole.OWNER && body.role) {
      throw new AppError(400, "OWNER_ROLE_LOCKED", "The owner role cannot be changed.");
    }

    const nextEmail = body.email?.trim();

    if (nextEmail && nextEmail !== existing.email) {
      const duplicate = await prisma.user.findUnique({
        where: { email: nextEmail },
        select: { id: true }
      });

      if (duplicate) {
        throw new AppError(409, "EMAIL_IN_USE", "Email is already registered.");
      }
    }

    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        email: nextEmail && nextEmail !== existing.email ? nextEmail : undefined,
        passwordHash: body.password ? await hashPassword(body.password) : undefined,
        role: body.role
      },
      select: managedUserSelect
    });

    await writeAuditLog({
      request,
      action: "user.update",
      targetType: "user",
      targetId: user.id,
      metadata: {
        roleChanged: body.role ?? null
      }
    });

    response.json({ user: serializeManagedUser(user) });
  })
);

userRoutes.delete(
  "/:id",
  asyncHandler(async (request, response) => {
    assertUserManager(request.auth!.role);

    const userId = z.string().parse(request.params.id);
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true
      }
    });

    if (!existing) {
      throw new AppError(404, "USER_NOT_FOUND", "User not found.");
    }

    if (existing.id === request.auth!.userId) {
      throw new AppError(400, "SELF_DELETE_DISABLED", "You cannot delete the account you are signed in with.");
    }

    if (existing.role === UserRole.OWNER) {
      throw new AppError(400, "OWNER_DELETE_DISABLED", "The owner account cannot be deleted.");
    }

    await prisma.user.delete({
      where: { id: existing.id }
    });

    await writeAuditLog({
      request,
      action: "user.delete",
      targetType: "user",
      targetId: existing.id
    });

    response.status(204).send();
  })
);

export { userRoutes };
