import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { parseBody } from '../lib/validate.js';
import { requireActiveProfile, requireAuth } from '../middleware/auth.js';
import { toContentCardDto } from '../lib/mappers.js';

export const historyRouter = Router();
historyRouter.use(requireAuth, requireActiveProfile);

const progressSchema = z.object({ contentId: z.string().min(1), episodeId: z.string().min(1).optional(), progressSeconds: z.number().int().min(0) });

historyRouter.post('/progress', asyncHandler(async (req, res) => {
  const body = parseBody(req, progressSchema);
  const key = `${req.activeProfileId}:${body.contentId}:${body.episodeId ?? 'movie'}`;
  await prisma.watchHistory.upsert({
    where: { key },
    update: { progressSeconds: body.progressSeconds },
    create: { key, profileId: req.activeProfileId!, contentId: body.contentId, episodeId: body.episodeId, progressSeconds: body.progressSeconds }
  });
  res.json({ ok: true });
}));

historyRouter.get('/', asyncHandler(async (req, res) => {
  const rows = await prisma.watchHistory.findMany({ where: { profileId: req.activeProfileId }, include: { content: { include: { genres: true } } }, orderBy: { updatedAt: 'desc' } });
  res.json({ items: rows.map((row) => ({ ...toContentCardDto(row.content), progressSeconds: row.progressSeconds, updatedAt: row.updatedAt })) });
}));
