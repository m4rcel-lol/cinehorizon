import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { parseBody } from '../lib/validate.js';
import { requireActiveProfile, requireAuth } from '../middleware/auth.js';
import { toContentCardDto } from '../lib/mappers.js';

export const watchlistRouter = Router();
watchlistRouter.use(requireAuth, requireActiveProfile);

const addSchema = z.object({ contentId: z.string().min(1) });

watchlistRouter.get('/', asyncHandler(async (req, res) => {
  const rows = await prisma.watchlist.findMany({ where: { profileId: req.activeProfileId }, include: { content: { include: { genres: true } } }, orderBy: { addedAt: 'desc' } });
  res.json({ items: rows.map((row) => toContentCardDto(row.content)) });
}));

watchlistRouter.post('/', asyncHandler(async (req, res) => {
  const { contentId } = parseBody(req, addSchema);
  await prisma.watchlist.upsert({ where: { profileId_contentId: { profileId: req.activeProfileId!, contentId } }, update: {}, create: { profileId: req.activeProfileId!, contentId } });
  res.status(201).json({ ok: true });
}));

watchlistRouter.delete('/:contentId', asyncHandler(async (req, res) => {
  await prisma.watchlist.deleteMany({ where: { profileId: req.activeProfileId, contentId: req.params.contentId } });
  res.status(204).send();
}));
