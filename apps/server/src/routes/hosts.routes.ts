import type { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { writeAuditLog } from "../services/audit.service";
import {
  buildEncryptedSecrets,
  getHostForUser,
  hostSummaryInclude,
  normalizeSecretInput,
  serializeHost
} from "../services/host.service";
import { discoverPm2Processes, testSshConnection } from "../services/ssh.service";
import { asyncHandler } from "../utils/async-handler";
import { AppError } from "../utils/app-error";

const hostRoutes = Router();

const createHostSchema = z
  .object({
    name: z.string().min(1).max(80),
    host: z.string().min(1).max(255),
    port: z.coerce.number().int().positive().default(22),
    username: z.string().min(1).max(255),
    authType: z.enum(["PASSWORD", "PRIVATE_KEY"]),
    password: z.string().optional(),
    privateKey: z.string().optional(),
    passphrase: z.string().optional(),
    tagIds: z.array(z.string().uuid()).default([])
  })
  .superRefine((value, context) => {
    if (value.authType === "PASSWORD" && !normalizeSecretInput(value.password)) {
      context.addIssue({
        code: "custom",
        path: ["password"],
        message: "Password is required for password authentication."
      });
    }

    if (value.authType === "PRIVATE_KEY" && !normalizeSecretInput(value.privateKey)) {
      context.addIssue({
        code: "custom",
        path: ["privateKey"],
        message: "Private key is required for key-based authentication."
      });
    }
  });

const updateHostSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    host: z.string().min(1).max(255).optional(),
    port: z.coerce.number().int().positive().optional(),
    username: z.string().min(1).max(255).optional(),
    authType: z.enum(["PASSWORD", "PRIVATE_KEY"]).optional(),
    password: z.string().optional(),
    privateKey: z.string().optional(),
    passphrase: z.string().optional(),
    tagIds: z.array(z.string().uuid()).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required."
  });

const testSchema = z.object({
  repinFingerprint: z.boolean().optional().default(false)
});

hostRoutes.use(requireAuth);

async function validateTags(userId: string, tagIds: string[]) {
  if (tagIds.length === 0) {
    return;
  }

  const tags = await prisma.tag.findMany({
    where: {
      id: { in: tagIds },
      userId
    }
  });

  if (tags.length !== tagIds.length) {
    throw new AppError(400, "INVALID_TAGS", "One or more tags do not belong to the authenticated user.");
  }
}

function buildTagSet(tagIds: string[] | undefined): Prisma.SshHostUpdateInput["hostTags"] | undefined {
  if (!tagIds) {
    return undefined;
  }

  return {
    deleteMany: {},
    create: tagIds.map((tagId) => ({
      tag: { connect: { id: tagId } }
    }))
  };
}

hostRoutes.get(
  "/",
  asyncHandler(async (request, response) => {
    const search = z.string().optional().parse(request.query.search);
    const tagIds = z
      .string()
      .optional()
      .transform((value) =>
        value
          ? value
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
          : []
      )
      .parse(request.query.tagIds);

    const where: Prisma.SshHostWhereInput = {
      userId: request.auth!.userId
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { host: { contains: search, mode: "insensitive" } },
        { username: { contains: search, mode: "insensitive" } }
      ];
    }

    if (tagIds.length > 0) {
      where.hostTags = {
        some: {
          tagId: { in: tagIds }
        }
      };
    }

    const hosts = await prisma.sshHost.findMany({
      where,
      include: hostSummaryInclude,
      orderBy: { name: "asc" }
    });

    response.json({ hosts: hosts.map(serializeHost) });
  })
);

hostRoutes.post(
  "/",
  asyncHandler(async (request, response) => {
    const body = createHostSchema.parse(request.body);
    await validateTags(request.auth!.userId, body.tagIds);

    const host = await prisma.sshHost.create({
      data: {
        userId: request.auth!.userId,
        name: body.name.trim(),
        host: body.host.trim(),
        port: body.port,
        username: body.username.trim(),
        authType: body.authType,
        ...buildEncryptedSecrets(body),
        hostTags: {
          create: body.tagIds.map((tagId) => ({
            tag: { connect: { id: tagId } }
          }))
        }
      },
      include: hostSummaryInclude
    });

    await writeAuditLog({
      request,
      action: "host.create",
      targetType: "ssh_host",
      targetId: host.id
    });

    response.status(201).json({ host: serializeHost(host) });
  })
);

hostRoutes.get(
  "/:id",
  asyncHandler(async (request, response) => {
    const hostId = z.string().parse(request.params.id);
    const host = await getHostForUser(hostId, request.auth!.userId);

    if (!host) {
      throw new AppError(404, "HOST_NOT_FOUND", "SSH host not found.");
    }

    response.json({ host: serializeHost(host) });
  })
);

hostRoutes.patch(
  "/:id",
  asyncHandler(async (request, response) => {
    const hostId = z.string().parse(request.params.id);
    const body = updateHostSchema.parse(request.body);
    const existing = await getHostForUser(hostId, request.auth!.userId);

    if (!existing) {
      throw new AppError(404, "HOST_NOT_FOUND", "SSH host not found.");
    }

    if (body.tagIds) {
      await validateTags(request.auth!.userId, body.tagIds);
    }

    const nextAuthType = body.authType ?? existing.authType;
    const switchingAuth = body.authType && body.authType !== existing.authType;
    const secretsProvided =
      body.password !== undefined || body.privateKey !== undefined || body.passphrase !== undefined;

    if (switchingAuth && nextAuthType === "PASSWORD" && !normalizeSecretInput(body.password)) {
      throw new AppError(400, "PASSWORD_REQUIRED", "Password is required when switching to password authentication.");
    }

    if (switchingAuth && nextAuthType === "PRIVATE_KEY" && !normalizeSecretInput(body.privateKey)) {
      throw new AppError(400, "PRIVATE_KEY_REQUIRED", "Private key is required when switching to private key authentication.");
    }

    const host = await prisma.sshHost.update({
      where: { id: existing.id },
      data: {
        name: body.name?.trim(),
        host: body.host?.trim(),
        port: body.port,
        username: body.username?.trim(),
        authType: nextAuthType,
        ...(secretsProvided || switchingAuth
          ? buildEncryptedSecrets({
              authType: nextAuthType,
              password: body.password,
              privateKey: body.privateKey,
              passphrase: body.passphrase
            })
          : {}),
        hostTags: buildTagSet(body.tagIds),
        hostFingerprint:
          body.host || body.port || body.username || body.authType ? null : undefined,
        lastTestedAt:
          body.host || body.port || body.username || body.authType ? null : undefined
      },
      include: hostSummaryInclude
    });

    await writeAuditLog({
      request,
      action: "host.update",
      targetType: "ssh_host",
      targetId: host.id
    });

    response.json({ host: serializeHost(host) });
  })
);

hostRoutes.delete(
  "/:id",
  asyncHandler(async (request, response) => {
    const hostId = z.string().parse(request.params.id);
    const existing = await getHostForUser(hostId, request.auth!.userId);

    if (!existing) {
      throw new AppError(404, "HOST_NOT_FOUND", "SSH host not found.");
    }

    await prisma.sshHost.delete({ where: { id: existing.id } });

    await writeAuditLog({
      request,
      action: "host.delete",
      targetType: "ssh_host",
      targetId: existing.id
    });

    response.status(204).send();
  })
);

hostRoutes.post(
  "/:id/test",
  asyncHandler(async (request, response) => {
    const hostId = z.string().parse(request.params.id);
    const body = testSchema.parse(request.body ?? {});
    const host = await prisma.sshHost.findFirst({
      where: {
        id: hostId,
        userId: request.auth!.userId
      }
    });

    if (!host) {
      throw new AppError(404, "HOST_NOT_FOUND", "SSH host not found.");
    }

    const result = await testSshConnection(host, {
      repinFingerprint: body.repinFingerprint
    });

    const updated = await prisma.sshHost.update({
      where: { id: host.id },
      data: {
        hostFingerprint: result.fingerprint,
        lastTestedAt: new Date()
      },
      include: hostSummaryInclude
    });

    await writeAuditLog({
      request,
      action: "host.test",
      targetType: "ssh_host",
      targetId: host.id,
      metadata: {
        fingerprint: result.fingerprint,
        repinFingerprint: body.repinFingerprint
      }
    });

    response.json({
      success: true,
      connection: result,
      host: serializeHost(updated)
    });
  })
);

hostRoutes.get(
  "/:id/processes",
  asyncHandler(async (request, response) => {
    const hostId = z.string().parse(request.params.id);
    const host = await prisma.sshHost.findFirst({
      where: {
        id: hostId,
        userId: request.auth!.userId
      }
    });

    if (!host) {
      throw new AppError(404, "HOST_NOT_FOUND", "SSH host not found.");
    }

    const result = await discoverPm2Processes(host);

    await writeAuditLog({
      request,
      action: "host.processes.fetch",
      targetType: "ssh_host",
      targetId: host.id,
      metadata: { count: result.processes.length }
    });

    response.json({
      fingerprint: result.fingerprint,
      processes: result.processes
    });
  })
);

export { hostRoutes };
