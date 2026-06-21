import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { parseBody, requireActiveProfileId, requireParam } from '../lib/validate.js';
import { requireActiveProfile, requireAuth } from '../middleware/auth.js';
import { toDownloadDto } from '../lib/mappers.js';

export const libraryRouter = Router();
libraryRouter.use(requireAuth, requireActiveProfile);

const addSchema = z.object({ downloadId: z.string().min(1) });

libraryRouter.get('/', asyncHandler(async (req, res) => {
  const profileId = requireActiveProfileId(req);
  const rows = await prisma.savedDownload.findMany({ where: { profileId }, include: { download: true }, orderBy: { savedAt: 'desc' } });
  res.json({ items: rows.map((row) => toDownloadDto(row.download)) });
}));

libraryRouter.post('/', asyncHandler(async (req, res) => {
  const { downloadId } = parseBody(req, addSchema);
  const profileId = requireActiveProfileId(req);
  await prisma.savedDownload.upsert({ where: { profileId_downloadId: { profileId, downloadId } }, update: {}, create: { profileId, downloadId } });
  res.status(201).json({ ok: true });
}));

libraryRouter.delete('/:downloadId', asyncHandler(async (req, res) => {
  const profileId = requireActiveProfileId(req);
  const downloadId = requireParam(req, 'downloadId');
  await prisma.savedDownload.deleteMany({ where: { profileId, downloadId } });
  res.status(204).send();
}));
