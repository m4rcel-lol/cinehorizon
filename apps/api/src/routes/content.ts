import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import { parseQuery, requireActiveProfileId, requireIntParam, requireParam } from '../lib/validate.js';
import { requireActiveProfile, requireAuth } from '../middleware/auth.js';
import { toContentCardDto, toGenreDto } from '../lib/mappers.js';
import { resolvePlaybackUrl } from '../services/storage.js';

export const contentRouter = Router();

const browseQuery = z.object({
  genre: z.string().optional(),
  type: z.enum(['MOVIE', 'SERIES']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  q: z.string().optional()
});

const includeCard = Prisma.validator<Prisma.ContentInclude>()({ genres: true });
const includeDetail = Prisma.validator<Prisma.ContentInclude>()({
  genres: true,
  cast: true,
  seasons: { orderBy: { number: 'asc' }, include: { episodes: { orderBy: { number: 'asc' } } } }
});

contentRouter.get('/', asyncHandler(async (req, res) => {
  const query = parseQuery(req, browseQuery);
  const where = {
    status: 'PUBLISHED' as const,
    ...(query.type ? { type: query.type } : {}),
    ...(query.q ? { OR: [{ title: { contains: query.q, mode: 'insensitive' as const } }, { description: { contains: query.q, mode: 'insensitive' as const } }] } : {}),
    ...(query.genre ? { genres: { some: { slug: query.genre } } } : {})
  };
  const [items, total] = await Promise.all([
    prisma.content.findMany({ where, include: includeCard, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }),
    prisma.content.count({ where })
  ]);
  res.json({ items: items.map(toContentCardDto), total, page: query.page, limit: query.limit });
}));

contentRouter.get('/featured', asyncHandler(async (_req, res) => {
  const items = await prisma.content.findMany({ where: { isFeatured: true, status: 'PUBLISHED' }, include: includeCard, take: 5, orderBy: { updatedAt: 'desc' } });
  res.json({ items: items.map(toContentCardDto) });
}));

contentRouter.get('/trending', asyncHandler(async (_req, res) => {
  const items = await prisma.content.findMany({ where: { isTrending: true, status: 'PUBLISHED' }, include: includeCard, take: 20, orderBy: { updatedAt: 'desc' } });
  res.json({ items: items.map(toContentCardDto) });
}));

contentRouter.get('/top-ten', asyncHandler(async (_req, res) => {
  const items = await prisma.content.findMany({ where: { isTopTen: true, status: 'PUBLISHED' }, include: includeCard, take: 10, orderBy: { topTenRank: 'asc' } });
  res.json({ items: items.map(toContentCardDto) });
}));

contentRouter.get('/new-arrivals', asyncHandler(async (_req, res) => {
  const items = await prisma.content.findMany({ where: { status: 'PUBLISHED' }, include: includeCard, take: 20, orderBy: { createdAt: 'desc' } });
  res.json({ items: items.map(toContentCardDto) });
}));

contentRouter.get('/genres', asyncHandler(async (_req, res) => {
  const genres = await prisma.genre.findMany({ orderBy: { name: 'asc' } });
  res.json({ genres: genres.map(toGenreDto) });
}));

contentRouter.get('/continue-watching', requireAuth, requireActiveProfile, asyncHandler(async (req, res) => {
  const profileId = requireActiveProfileId(req);
  const rows = await prisma.watchHistory.findMany({
    where: { profileId, progressSeconds: { gt: 0 }, completedAt: null },
    include: { content: { include: includeCard } },
    orderBy: { updatedAt: 'desc' },
    take: 20
  });
  res.json({ items: rows.map((row) => ({ ...toContentCardDto(row.content), progressSeconds: row.progressSeconds })) });
}));

contentRouter.get('/:slug', asyncHandler(async (req, res) => {
  const slug = requireParam(req, 'slug');
  const content = await prisma.content.findUnique({ where: { slug }, include: includeDetail });
  if (!content || content.status !== 'PUBLISHED') throw new AppError(404, 'CONTENT_NOT_FOUND', 'Content not found');
  res.json({ content: { ...toContentCardDto(content), cast: content.cast, seasons: content.seasons, maturityTags: content.maturityTags } });
}));

contentRouter.get('/:slug/episodes/:season', asyncHandler(async (req, res) => {
  const slug = requireParam(req, 'slug');
  const seasonNumber = requireIntParam(req, 'season');
  const content = await prisma.content.findUnique({ where: { slug }, include: { seasons: { where: { number: seasonNumber }, include: { episodes: { orderBy: { number: 'asc' } } } } } });
  if (!content) throw new AppError(404, 'CONTENT_NOT_FOUND', 'Content not found');
  res.json({ episodes: content.seasons[0]?.episodes ?? [] });
}));

contentRouter.get('/:slug/playback', requireAuth, requireActiveProfile, asyncHandler(async (req, res) => {
  const slug = requireParam(req, 'slug');
  const profileId = requireActiveProfileId(req);
  const episodeId = typeof req.query.episodeId === 'string' ? req.query.episodeId : undefined;
  const content = await prisma.content.findUnique({ where: { slug } });
  if (!content) throw new AppError(404, 'CONTENT_NOT_FOUND', 'Content not found');
  const video = await prisma.video.findFirst({ where: episodeId ? { episodeId, status: 'READY' } : { contentId: content.id, status: 'READY' }, orderBy: { uploadedAt: 'desc' } });
  if (!video) throw new AppError(404, 'VIDEO_NOT_READY', 'Video is not ready');
  const historyKey = `${profileId}:${content.id}:${episodeId ?? 'movie'}`;
  const history = await prisma.watchHistory.findUnique({ where: { key: historyKey } }).catch(() => null);
  const streamUrl = await resolvePlaybackUrl(video.storageKey ?? video.url);
  res.json({ contentId: content.id, title: content.title, episodeTitle: null, streamUrl, mimeType: video.mimeType, progressSeconds: history?.progressSeconds ?? 0 });
}));
