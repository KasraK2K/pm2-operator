import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { writeAuditLog } from "../services/audit.service";
import { serializeTag } from "../services/host.service";
import { asyncHandler } from "../utils/async-handler";
import { AppError } from "../utils/app-error";

const tagRoutes = Router();

const tagSchema = z.object({
  name: z.string().min(1).max(40),
  color: z.string().regex(/^#([0-9A-Fa-f]{6})$/).optional().nullable()
});

tagRoutes.use(requireAuth);

tagRoutes.get(
  "/",
  asyncHandler(async (request, response) => {
    const tags = await prisma.tag.findMany({
      where: { userId: request.auth!.userId },
      orderBy: { name: "asc" }
    });

    response.json({ tags: tags.map(serializeTag) });
  })
);

tagRoutes.post(
  "/",
  asyncHandler(async (request, response) => {
    const body = tagSchema.parse(request.body);
    const tag = await prisma.tag.create({
      data: {
        userId: request.auth!.userId,
        name: body.name.trim(),
        color: body.color ?? null
      }
    });

    await writeAuditLog({
      request,
      action: "tag.create",
      targetType: "tag",
      targetId: tag.id
    });

    response.status(201).json({ tag: serializeTag(tag) });
  })
);

tagRoutes.patch(
  "/:id",
  asyncHandler(async (request, response) => {
    const tagId = z.string().parse(request.params.id);
    const body = tagSchema.partial().parse(request.body);
    const existing = await prisma.tag.findFirst({
      where: { id: tagId, userId: request.auth!.userId }
    });

    if (!existing) {
      throw new AppError(404, "TAG_NOT_FOUND", "Tag not found.");
    }

    const tag = await prisma.tag.update({
      where: { id: existing.id },
      data: {
        name: body.name?.trim(),
        color: body.color === undefined ? undefined : body.color
      }
    });

    await writeAuditLog({
      request,
      action: "tag.update",
      targetType: "tag",
      targetId: tag.id
    });

    response.json({ tag: serializeTag(tag) });
  })
);

tagRoutes.delete(
  "/:id",
  asyncHandler(async (request, response) => {
    const tagId = z.string().parse(request.params.id);
    const existing = await prisma.tag.findFirst({
      where: { id: tagId, userId: request.auth!.userId }
    });

    if (!existing) {
      throw new AppError(404, "TAG_NOT_FOUND", "Tag not found.");
    }

    await prisma.tag.delete({ where: { id: existing.id } });

    await writeAuditLog({
      request,
      action: "tag.delete",
      targetType: "tag",
      targetId: existing.id
    });

    response.status(204).send();
  })
);

export { tagRoutes };
