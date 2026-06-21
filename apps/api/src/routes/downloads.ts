import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import { parseQuery, requireParam } from '../lib/validate.js';
import { toDownloadDto } from '../lib/mappers.js';
import { resolveLocalPath } from '../services/storage.js';

export const downloadsRouter = Router();

const categorySchema = z.enum(['GAME', 'SOFTWARE']);

const listQuery = z.object({
  category: categorySchema.optional(),
  platform: z.enum(['WINDOWS', 'MAC', 'LINUX', 'ANDROID', 'IOS', 'WEB', 'MULTI']).optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(24)
});

const shelfQuery = z.object({ category: categorySchema.optional() });

function requireCategory(req: import('express').Request) {
  const parsed = categorySchema.safeParse(requireParam(req, 'category').toUpperCase());
  if (!parsed.success) throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Unknown download category');
  return parsed.data;
}

downloadsRouter.get('/', asyncHandler(async (req, res) => {
  const query = parseQuery(req, listQuery);
  const where = {
    isPublished: true,
    ...(query.category ? { category: query.category } : {}),
    ...(query.platform ? { platform: query.platform } : {}),
    ...(query.q ? { OR: [{ title: { contains: query.q, mode: 'insensitive' as const } }, { description: { contains: query.q, mode: 'insensitive' as const } }] } : {})
  };
  const [items, total] = await Promise.all([
    prisma.download.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }),
    prisma.download.count({ where })
  ]);
  res.json({ items: items.map(toDownloadDto), total, page: query.page, limit: query.limit });
}));

downloadsRouter.get('/featured', asyncHandler(async (req, res) => {
  const { category } = parseQuery(req, shelfQuery);
  const items = await prisma.download.findMany({
    where: { isPublished: true, isFeatured: true, ...(category ? { category } : {}) },
    orderBy: { updatedAt: 'desc' },
    take: 5
  });
  res.json({ items: items.map(toDownloadDto) });
}));

downloadsRouter.get('/trending', asyncHandler(async (req, res) => {
  const { category } = parseQuery(req, shelfQuery);
  const items = await prisma.download.findMany({
    where: { isPublished: true, isTrending: true, ...(category ? { category } : {}) },
    orderBy: { downloadCount: 'desc' },
    take: 20
  });
  res.json({ items: items.map(toDownloadDto) });
}));

downloadsRouter.get('/top', asyncHandler(async (req, res) => {
  const { category } = parseQuery(req, shelfQuery);
  const items = await prisma.download.findMany({
    where: { isPublished: true, isTopRanked: true, ...(category ? { category } : {}) },
    orderBy: [{ rank: 'asc' }, { downloadCount: 'desc' }],
    take: 10
  });
  res.json({ items: items.map(toDownloadDto) });
}));

downloadsRouter.get('/:category/:slug', asyncHandler(async (req, res) => {
  const category = requireCategory(req);
  const slug = requireParam(req, 'slug');
  const item = await prisma.download.findUnique({ where: { category_slug: { category, slug } } });
  if (!item || !item.isPublished) throw new AppError(404, 'DOWNLOAD_NOT_FOUND', 'Download not found');
  res.json({ item: toDownloadDto(item) });
}));

downloadsRouter.get('/:category/:slug/download', asyncHandler(async (req, res) => {
  const category = requireCategory(req);
  const slug = requireParam(req, 'slug');
  const item = await prisma.download.findUnique({ where: { category_slug: { category, slug } } });
  if (!item || !item.isPublished) throw new AppError(404, 'DOWNLOAD_NOT_FOUND', 'Download not found');
  await prisma.download.update({ where: { id: item.id }, data: { downloadCount: { increment: 1 } } });
  res.download(resolveLocalPath(item.storageKey), item.fileName, (error) => {
    if (error && !res.headersSent) {
      res.status(404).json({ error: 'File is no longer available', code: 'DOWNLOAD_FILE_MISSING', statusCode: 404 });
    }
  });
}));
