import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { parseBody, requireActiveProfileId, requireParam } from '../lib/validate.js';
import { requireActiveProfile, requireAuth } from '../middleware/auth.js';
import { toContentCardDto } from '../lib/mappers.js';
export const watchlistRouter = Router();
watchlistRouter.use(requireAuth, requireActiveProfile);
const addSchema = z.object({ contentId: z.string().min(1) });
watchlistRouter.get('/', asyncHandler(async (req, res) => {
    const profileId = requireActiveProfileId(req);
    const rows = await prisma.watchlist.findMany({ where: { profileId }, include: { content: { include: { genres: true } } }, orderBy: { addedAt: 'desc' } });
    res.json({ items: rows.map((row) => toContentCardDto(row.content)) });
}));
watchlistRouter.post('/', asyncHandler(async (req, res) => {
    const { contentId } = parseBody(req, addSchema);
    const profileId = requireActiveProfileId(req);
    await prisma.watchlist.upsert({ where: { profileId_contentId: { profileId, contentId } }, update: {}, create: { profileId, contentId } });
    res.status(201).json({ ok: true });
}));
watchlistRouter.delete('/:contentId', asyncHandler(async (req, res) => {
    const profileId = requireActiveProfileId(req);
    const contentId = requireParam(req, 'contentId');
    await prisma.watchlist.deleteMany({ where: { profileId, contentId } });
    res.status(204).send();
}));
//# sourceMappingURL=watchlist.js.map