import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import { parseQuery, requireParam } from '../lib/validate.js';
import { toGameDto } from '../lib/mappers.js';
import { resolveLocalPath } from '../services/storage.js';

export const gamesRouter = Router();

const listQuery = z.object({
  platform: z.enum(['WINDOWS', 'MAC', 'LINUX', 'ANDROID', 'MULTI']).optional(),
  q: z.string().optional()
});

gamesRouter.get('/', asyncHandler(async (req, res) => {
  const query = parseQuery(req, listQuery);
  const where = {
    isPublished: true,
    ...(query.platform ? { platform: query.platform } : {}),
    ...(query.q ? { OR: [{ title: { contains: query.q, mode: 'insensitive' as const } }, { description: { contains: query.q, mode: 'insensitive' as const } }] } : {})
  };
  const games = await prisma.game.findMany({ where, orderBy: { createdAt: 'desc' } });
  res.json({ items: games.map(toGameDto) });
}));

gamesRouter.get('/:slug', asyncHandler(async (req, res) => {
  const slug = requireParam(req, 'slug');
  const game = await prisma.game.findUnique({ where: { slug } });
  if (!game || !game.isPublished) throw new AppError(404, 'GAME_NOT_FOUND', 'Game not found');
  res.json({ game: toGameDto(game) });
}));

gamesRouter.get('/:slug/download', asyncHandler(async (req, res) => {
  const slug = requireParam(req, 'slug');
  const game = await prisma.game.findUnique({ where: { slug } });
  if (!game || !game.isPublished) throw new AppError(404, 'GAME_NOT_FOUND', 'Game not found');
  await prisma.game.update({ where: { id: game.id }, data: { downloadCount: { increment: 1 } } });
  res.download(resolveLocalPath(game.storageKey), game.fileName, (error) => {
    if (error && !res.headersSent) {
      res.status(404).json({ error: 'Game file is no longer available', code: 'GAME_FILE_MISSING', statusCode: 404 });
    }
  });
}));
