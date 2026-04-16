import type { AuthType, Prisma, Tag } from "@prisma/client";

import { prisma } from "../lib/prisma";
import { decryptSecret, encryptSecret } from "./crypto.service";

export const hostSummaryInclude = {
  hostTags: {
    include: {
      tag: true
    }
  }
} satisfies Prisma.SshHostInclude;

export type HostWithTags = Prisma.SshHostGetPayload<{
  include: typeof hostSummaryInclude;
}>;

interface HostSecretsInput {
  authType: AuthType;
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

export function normalizeSecretInput(value?: string | null) {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function buildEncryptedSecrets(input: HostSecretsInput) {
  const password = normalizeSecretInput(input.password);
  const privateKey = normalizeSecretInput(input.privateKey);
  const passphrase = normalizeSecretInput(input.passphrase);

  if (input.authType === "PASSWORD") {
    return {
      encryptedPassword: password ? encryptSecret(password) : null,
      encryptedPrivateKey: null,
      encryptedPassphrase: null
    };
  }

  return {
    encryptedPassword: null,
    encryptedPrivateKey: privateKey ? encryptSecret(privateKey) : null,
    encryptedPassphrase: passphrase ? encryptSecret(passphrase) : null
  };
}

export function resolveHostSecrets(host: {
  authType: AuthType;
  encryptedPassword: string | null;
  encryptedPrivateKey: string | null;
  encryptedPassphrase: string | null;
}) {
  return {
    password: host.encryptedPassword ? decryptSecret(host.encryptedPassword) : undefined,
    privateKey: host.encryptedPrivateKey ? decryptSecret(host.encryptedPrivateKey) : undefined,
    passphrase: host.encryptedPassphrase ? decryptSecret(host.encryptedPassphrase) : undefined
  };
}

export function serializeTag(tag: Tag) {
  return {
    id: tag.id,
    name: tag.name,
    color: tag.color,
    createdAt: tag.createdAt,
    updatedAt: tag.updatedAt
  };
}

export function serializeHost(host: HostWithTags) {
  return {
    id: host.id,
    name: host.name,
    host: host.host,
    port: host.port,
    username: host.username,
    authType: host.authType,
    hostFingerprint: host.hostFingerprint,
    lastTestedAt: host.lastTestedAt,
    createdAt: host.createdAt,
    updatedAt: host.updatedAt,
    tags: host.hostTags.map((item) => serializeTag(item.tag))
  };
}

export async function getHostForUser(hostId: string, userId: string) {
  return prisma.sshHost.findFirst({
    where: { id: hostId, userId },
    include: hostSummaryInclude
  });
}

