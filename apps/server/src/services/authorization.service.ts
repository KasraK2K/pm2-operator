import { UserRole } from "@prisma/client";

import { AppError } from "../utils/app-error";

export const WORKSPACE_MANAGER_ROLES: readonly UserRole[] = [UserRole.OWNER, UserRole.ADMIN];

export function canManageWorkspace(role: UserRole) {
  return WORKSPACE_MANAGER_ROLES.includes(role);
}

export function canManageUsers(role: UserRole) {
  return WORKSPACE_MANAGER_ROLES.includes(role);
}

export function requireRole(role: UserRole, allowedRoles: readonly UserRole[], message?: string) {
  if (allowedRoles.includes(role)) {
    return;
  }

  throw new AppError(403, "FORBIDDEN", message ?? "You do not have access to perform this action.");
}

export function assertWorkspaceManager(role: UserRole) {
  requireRole(role, WORKSPACE_MANAGER_ROLES, "Only owners and admins can manage workspace settings.");
}

export function assertUserManager(role: UserRole) {
  requireRole(role, WORKSPACE_MANAGER_ROLES, "Only owners and admins can manage users.");
}
