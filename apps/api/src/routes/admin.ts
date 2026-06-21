import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import Busboy from 'busboy';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { subDays } from 'date-fns';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import { parseBody, parseQuery, pickDefined, requireIntParam, requireParam } from '../lib/validate.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { slugify } from '../lib/slug.js';
import { toContentCardDto, toDownloadDto, toUserDto } from '../lib/mappers.js';
import { assertMagicBytes } from '../middleware/uploadGuard.js';
import { env } from '../config/env.js';
import { transcodeQueue } from '../queues/transcodeQueue.js';
import { deleteObjectByKey, putObject } from '../services/storage.js';
import { compressImageToWebp } from '../services/imageCompression.js';
import { emailStatus } from '../services/email.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

const paginationSchema = z.object({ page: z.coerce.number().int().positive().default(1), limit: z.coerce.number().int().min(1).max(100).default(20), q: z.string().optional() });
const contentListSchema = paginationSchema.extend({ status: z.enum(['DRAFT', 'PROCESSING', 'PUBLISHED', 'ARCHIVED']).optional(), type: z.enum(['MOVIE', 'SERIES']).optional() });

const contentSchema = z.object({
  title: z.string().min(1).max(120),
  slug: z.string().min(1).max(140).optional(),
  description: z.string().min(1).max(500),
  type: z.enum(['MOVIE', 'SERIES']),
  releaseYear: z.number().int().min(1888).max(2100),
  ageRating: z.string().min(1).max(20),
  durationMinutes: z.number().int().positive().nullable().optional(),
  backdropUrl: z.string().url(),
  posterUrl: z.string().url(),
  logoUrl: z.string().url().nullable().optional(),
  trailerUrl: z.string().url().nullable().optional(),
  isFeatured: z.boolean().default(false),
  isOriginal: z.boolean().default(false),
  isTrending: z.boolean().default(false),
  isTopTen: z.boolean().default(false),
  topTenRank: z.number().int().min(1).max(10).nullable().optional(),
  status: z.enum(['DRAFT', 'PROCESSING', 'PUBLISHED', 'ARCHIVED']).default('DRAFT'),
  genreIds: z.array(z.string()).default([]),
  maturityTags: z.array(z.string()).default([]),
  cast: z.array(z.object({ name: z.string().min(1), role: z.string().min(1), characterName: z.string().optional().nullable() })).default([])
});
const contentPatchSchema = contentSchema.partial();
const episodeSchema = z.object({ number: z.number().int().positive(), title: z.string().min(1), description: z.string().min(1), durationMinutes: z.number().int().positive(), thumbnailUrl: z.string().url() });
const imageMimeToExtension = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp']
]);

const STATS_WINDOW_DAYS = 14;

adminRouter.get('/stats', asyncHandler(async (_req, res) => {
  const windowStart = subDays(new Date(), STATS_WINDOW_DAYS - 1);
  windowStart.setHours(0, 0, 0, 0);
  const [users, movies, series, games, software, downloadAgg, activeSessions, storageAgg, recentUsers, watchByContent, topDownloads] = await Promise.all([
    prisma.user.count(),
    prisma.content.count({ where: { type: 'MOVIE' } }),
    prisma.content.count({ where: { type: 'SERIES' } }),
    prisma.download.count({ where: { category: 'GAME' } }),
    prisma.download.count({ where: { category: 'SOFTWARE' } }),
    prisma.download.aggregate({ _sum: { downloadCount: true } }),
    prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
    prisma.video.aggregate({ _sum: { size: true } }),
    prisma.user.findMany({ where: { createdAt: { gte: windowStart } }, select: { createdAt: true } }),
    prisma.watchHistory.groupBy({ by: ['contentId'], _sum: { progressSeconds: true }, orderBy: { _sum: { progressSeconds: 'desc' } }, take: 8 }),
    prisma.download.findMany({ where: { downloadCount: { gt: 0 } }, orderBy: { downloadCount: 'desc' }, take: 8, select: { title: true, downloadCount: true } })
  ]);

  // Build a continuous day-by-day signup series so the chart has no gaps.
  const buckets = new Map<string, number>();
  for (let i = 0; i < STATS_WINDOW_DAYS; i++) {
    const day = subDays(new Date(), STATS_WINDOW_DAYS - 1 - i);
    buckets.set(day.toISOString().slice(0, 10), 0);
  }
  for (const u of recentUsers) {
    const key = u.createdAt.toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const newUsers = [...buckets.entries()].map(([date, count]) => ({ date, label: date.slice(5), count }));

  const watchedIds = watchByContent.map((row) => row.contentId);
  const titles = watchedIds.length
    ? await prisma.content.findMany({ where: { id: { in: watchedIds } }, select: { id: true, title: true } })
    : [];
  const titleById = new Map(titles.map((t) => [t.id, t.title]));
  const topContent = watchByContent.map((row) => ({
    title: titleById.get(row.contentId) ?? 'Unknown',
    minutes: Math.round((row._sum.progressSeconds ?? 0) / 60)
  }));

  res.json({
    totalUsers: users,
    totalContent: movies + series,
    movies,
    series,
    games,
    software,
    totalDownloads: games + software,
    downloadCount: downloadAgg._sum.downloadCount ?? 0,
    activeSessions,
    storageBytes: Number(storageAgg._sum.size ?? 0n),
    newUsers,
    topContent,
    topDownloads: topDownloads.map((d) => ({ title: d.title, count: d.downloadCount }))
  });
}));

adminRouter.get('/system', asyncHandler(async (_req, res) => {
  const [downloads, pendingJobs, failedJobs] = await Promise.all([
    prisma.download.count(),
    prisma.uploadJob.count({ where: { status: { in: ['PENDING', 'PROCESSING'] } } }),
    prisma.uploadJob.count({ where: { status: 'FAILED' } })
  ]);
  let dbOk = true;
  try { await prisma.$queryRaw`SELECT 1`; } catch { dbOk = false; }
  res.json({
    appName: env.APP_NAME,
    environment: env.NODE_ENV,
    baseUrl: env.BASE_URL,
    mediaDir: env.LOCAL_MEDIA_DIR,
    uptimeSeconds: Math.round(process.uptime()),
    email: emailStatus(),
    db: dbOk ? 'ok' : 'down',
    downloads,
    pendingJobs,
    failedJobs
  });
}));

adminRouter.get('/users', asyncHandler(async (req, res) => {
  const query = parseQuery(req, paginationSchema);
  const where = query.q ? { OR: [{ email: { contains: query.q, mode: 'insensitive' as const } }, { displayName: { contains: query.q, mode: 'insensitive' as const } }] } : {};
  const [users, total] = await Promise.all([
    prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }),
    prisma.user.count({ where })
  ]);
  res.json({ users: users.map(toUserDto), total, page: query.page, limit: query.limit });
}));

adminRouter.patch('/users/:id', asyncHandler(async (req, res) => {
  const body = parseBody(req, z.object({ role: z.enum(['USER', 'ADMIN']).optional(), isVerified: z.boolean().optional() }));
  const id = requireParam(req, 'id');
  const data: Prisma.UserUpdateInput = {};
  if (body.role !== undefined) data.role = body.role;
  if (body.isVerified !== undefined) data.isVerified = body.isVerified;
  const user = await prisma.user.update({ where: { id }, data });
  res.json({ user: toUserDto(user) });
}));

adminRouter.delete('/users/:id', asyncHandler(async (req, res) => {
  const id = requireParam(req, 'id');
  if (id === req.auth!.userId) throw new AppError(400, 'SELF_DELETE_FORBIDDEN', 'You cannot delete your own admin account');
  await prisma.user.delete({ where: { id } });
  res.status(204).send();
}));

adminRouter.get('/genres', asyncHandler(async (_req, res) => {
  const genres = await prisma.genre.findMany({ orderBy: { name: 'asc' } });
  res.json({ genres });
}));

adminRouter.post('/genres', asyncHandler(async (req, res) => {
  const { name } = parseBody(req, z.object({ name: z.string().min(1).max(50) }));
  const genre = await prisma.genre.create({ data: { name, slug: slugify(name) } });
  res.status(201).json({ genre });
}));

async function receiveImageUpload(req: import('express').Request) {
  const uploadDir = path.join(env.LOCAL_MEDIA_DIR, 'uploads');
  await fsp.mkdir(uploadDir, { recursive: true });
  return new Promise<{ url: string; key: string }>((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers, limits: { files: 1, fileSize: 10 * 1024 * 1024 } });
    let settled = false;
    let sawFile = false;

    function resolveOnce(value: { url: string; key: string }) {
      if (settled) return;
      settled = true;
      resolve(value);
    }

    function rejectOnce(error: unknown, tmpPath?: string) {
      if (settled) return;
      settled = true;
      if (tmpPath) void fsp.rm(tmpPath, { force: true }).catch(() => undefined);
      reject(error);
    }

    busboy.on('file', (_field, file, info) => {
      sawFile = true;
      const mime = info.mimeType;
      const extension = imageMimeToExtension.get(mime);
      if (!extension) {
        file.resume();
        rejectOnce(new AppError(400, 'BAD_IMAGE_TYPE', 'Only JPG, PNG, and WebP images are allowed'));
        return;
      }

      const safeBase = path.basename(info.filename || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_');
      const tmpPath = path.join(uploadDir, `${Date.now()}-${safeBase}`);
      const writeStream = fs.createWriteStream(tmpPath);
      let header = Buffer.alloc(0);
      let limited = false;

      file.on('data', (chunk: Buffer) => {
        if (header.length < 12) header = Buffer.concat([header, chunk.subarray(0, 12 - header.length)]);
      });
      file.on('limit', () => {
        limited = true;
        file.unpipe(writeStream);
        file.resume();
        writeStream.destroy();
        rejectOnce(new AppError(413, 'IMAGE_TOO_LARGE', 'Image upload exceeds the 10MB limit'), tmpPath);
      });
      file.pipe(writeStream);
      writeStream.on('error', (error) => rejectOnce(error, tmpPath));
      writeStream.on('finish', async () => {
        if (limited || settled) return;
        let compressedPath: string | undefined;
        try {
          assertMagicBytes(header.subarray(0, 12), mime, 'image');
          compressedPath = `${tmpPath}.webp`;
          await compressImageToWebp(tmpPath, compressedPath);
          const key = `images/${Date.now()}-${safeBase.replace(/\.[^.]+$/, '')}.webp`;
          const url = await putObject(key, compressedPath);
          await Promise.all([
            fsp.rm(tmpPath, { force: true }),
            fsp.rm(compressedPath, { force: true })
          ]);
          resolveOnce({ url, key });
        } catch (error) {
          await Promise.all([
            fsp.rm(tmpPath, { force: true }).catch(() => undefined),
            compressedPath ? fsp.rm(compressedPath, { force: true }).catch(() => undefined) : Promise.resolve()
          ]);
          rejectOnce(error);
        }
      });
    });

    busboy.on('finish', () => { if (!settled && !sawFile) rejectOnce(new AppError(400, 'NO_FILE', 'No image file uploaded')); });
    busboy.on('error', rejectOnce);
    req.pipe(busboy);
  });
}

adminRouter.post('/uploads/media', asyncHandler(async (req, res) => {
  const upload = await receiveImageUpload(req);
  res.status(201).json(upload);
}));

adminRouter.get('/content', asyncHandler(async (req, res) => {
  const query = parseQuery(req, contentListSchema);
  const where = { ...(query.status ? { status: query.status } : {}), ...(query.type ? { type: query.type } : {}), ...(query.q ? { title: { contains: query.q, mode: 'insensitive' as const } } : {}) };
  const [items, total] = await Promise.all([
    prisma.content.findMany({ where, include: { genres: true }, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }),
    prisma.content.count({ where })
  ]);
  res.json({ items: items.map(toContentCardDto), total, page: query.page, limit: query.limit });
}));

// Derive a slug that is guaranteed unique, appending -2, -3, ... on collision
// so creating/renaming content never fails on the slug unique constraint.
async function uniqueContentSlug(source: string, excludeId?: string) {
  const root = slugify(source);
  if (!root) throw new AppError(400, 'BAD_TITLE', 'Title must contain alphanumeric characters');
  let candidate = root;
  for (let n = 2; ; n++) {
    const existing = await prisma.content.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing || existing.id === excludeId) return candidate;
    candidate = `${root}-${n}`;
  }
}

adminRouter.post('/content', asyncHandler(async (req, res) => {
  const body = parseBody(req, contentSchema);
  const content = await prisma.content.create({
    data: {
      title: body.title,
      slug: await uniqueContentSlug(body.slug ?? body.title),
      description: body.description,
      type: body.type,
      releaseYear: body.releaseYear,
      ageRating: body.ageRating,
      durationMinutes: body.type === 'MOVIE' ? body.durationMinutes ?? null : null,
      backdropUrl: body.backdropUrl,
      posterUrl: body.posterUrl,
      logoUrl: body.logoUrl ?? null,
      trailerUrl: body.trailerUrl ?? null,
      isFeatured: body.isFeatured,
      isOriginal: body.isOriginal,
      isTrending: body.isTrending,
      isTopTen: body.isTopTen,
      topTenRank: body.isTopTen ? body.topTenRank ?? null : null,
      status: body.status,
      maturityTags: body.maturityTags,
      genres: { connect: body.genreIds.map((id) => ({ id })) },
      cast: { create: body.cast.map((member) => ({ name: member.name, role: member.role, characterName: member.characterName ?? null })) }
    },
    include: { genres: true }
  });
  res.status(201).json({ content: toContentCardDto(content) });
}));

adminRouter.patch('/content/:id', asyncHandler(async (req, res) => {
  const body = parseBody(req, contentPatchSchema);
  const id = requireParam(req, 'id');
  const data: Prisma.ContentUpdateInput = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.slug !== undefined) data.slug = await uniqueContentSlug(body.slug, id);
  if (body.description !== undefined) data.description = body.description;
  if (body.type !== undefined) data.type = body.type;
  if (body.releaseYear !== undefined) data.releaseYear = body.releaseYear;
  if (body.ageRating !== undefined) data.ageRating = body.ageRating;
  if (body.durationMinutes !== undefined) data.durationMinutes = body.durationMinutes;
  if (body.backdropUrl !== undefined) data.backdropUrl = body.backdropUrl;
  if (body.posterUrl !== undefined) data.posterUrl = body.posterUrl;
  if (body.logoUrl !== undefined) data.logoUrl = body.logoUrl;
  if (body.trailerUrl !== undefined) data.trailerUrl = body.trailerUrl;
  if (body.isFeatured !== undefined) data.isFeatured = body.isFeatured;
  if (body.isOriginal !== undefined) data.isOriginal = body.isOriginal;
  if (body.isTrending !== undefined) data.isTrending = body.isTrending;
  if (body.isTopTen !== undefined) data.isTopTen = body.isTopTen;
  if (body.topTenRank !== undefined) data.topTenRank = body.topTenRank;
  if (body.status !== undefined) data.status = body.status;
  if (body.maturityTags !== undefined) data.maturityTags = body.maturityTags;
  if (body.genreIds !== undefined) data.genres = { set: body.genreIds.map((genreId) => ({ id: genreId })) };
  const content = await prisma.content.update({
    where: { id },
    data,
    include: { genres: true }
  });
  if (body.cast !== undefined) {
    await prisma.castMember.deleteMany({ where: { contentId: content.id } });
    if (body.cast.length) {
      await prisma.castMember.createMany({
        data: body.cast.map((member) => ({
          contentId: content.id,
          name: member.name,
          role: member.role,
          characterName: member.characterName ?? null
        }))
      });
    }
  }
  res.json({ content: toContentCardDto(content) });
}));

adminRouter.delete('/content/:id', asyncHandler(async (req, res) => {
  const id = requireParam(req, 'id');
  const videos = await prisma.video.findMany({ where: { contentId: id } });
  await prisma.content.delete({ where: { id } });
  await Promise.all(videos.map((video) => video.storageKey
    ? deleteObjectByKey(video.storageKey.split('/master.m3u8')[0]!).catch(() => undefined)
    : Promise.resolve()));
  res.status(204).send();
}));

adminRouter.post('/content/:id/seasons/:season/episodes', asyncHandler(async (req, res) => {
  const body = parseBody(req, episodeSchema);
  const id = requireParam(req, 'id');
  const seasonNumber = requireIntParam(req, 'season');
  const content = await prisma.content.findUnique({ where: { id } });
  if (!content) throw new AppError(404, 'CONTENT_NOT_FOUND', 'Content not found');
  const season = await prisma.season.upsert({ where: { contentId_number: { contentId: content.id, number: seasonNumber } }, update: {}, create: { contentId: content.id, number: seasonNumber, title: `Season ${seasonNumber}` } });
  const episode = await prisma.episode.create({ data: { ...body, seasonId: season.id } });
  res.status(201).json({ episode });
}));

async function receiveVideoUpload(req: import('express').Request, target: { contentId?: string; episodeId?: string }) {
  const uploadDir = path.join(env.LOCAL_MEDIA_DIR, 'uploads');
  await fsp.mkdir(uploadDir, { recursive: true });
  return new Promise<{ uploadJobId: string; videoId: string }>((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers, limits: { files: 1, fileSize: 5 * 1024 * 1024 * 1024 } });
    let settled = false;
    let sawFile = false;
    let limited = false;
    let mime = '';
    let fileName = 'upload';
    let tmpPath: string | undefined;
    let header = Buffer.alloc(0);
    let total = 0n;
    let writeResolve: () => void = () => undefined;
    const writeDone = new Promise<void>((r) => { writeResolve = r; });

    function fail(error: unknown) {
      if (settled) return;
      settled = true;
      if (tmpPath) void fsp.rm(tmpPath, { force: true }).catch(() => undefined);
      reject(error);
    }

    busboy.on('file', (_field, file, info) => {
      sawFile = true;
      mime = info.mimeType;
      fileName = info.filename || 'upload';
      if (!['video/mp4', 'video/webm', 'video/quicktime'].includes(mime)) {
        file.resume();
        fail(new AppError(400, 'BAD_VIDEO_TYPE', 'Only MP4, WebM, and MOV videos are allowed'));
        return;
      }
      const safeBase = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
      tmpPath = path.join(uploadDir, `${Date.now()}-${safeBase}`);
      const writeStream = fs.createWriteStream(tmpPath);
      file.on('data', (chunk: Buffer) => {
        if (header.length < 12) header = Buffer.concat([header, chunk.subarray(0, 12 - header.length)]);
        total += BigInt(chunk.length);
      });
      file.on('limit', () => {
        limited = true;
        file.unpipe(writeStream);
        file.resume();
        writeStream.destroy();
        fail(new AppError(413, 'VIDEO_TOO_LARGE', 'Video upload exceeds the 5GB limit'));
      });
      file.pipe(writeStream);
      writeStream.on('error', (error) => fail(error));
      writeStream.on('finish', () => writeResolve());
    });

    busboy.on('error', fail);
    // Wait for the file to be fully written before touching the DB/queue: busboy's
    // completion event fires before the write stream flushes, so the original code
    // rejected every upload as NO_FILE before the file had been persisted.
    busboy.on('close', async () => {
      if (settled || limited) return;
      if (!sawFile || !tmpPath) {
        fail(new AppError(400, 'NO_FILE', 'No video file uploaded'));
        return;
      }
      await writeDone;
      if (settled) return;
      try {
        assertMagicBytes(header.subarray(0, 12), mime, 'video');
        const video = await prisma.video.create({ data: { ...target, quality: 'FHD_1080', url: '', size: total, mimeType: mime, status: 'PENDING' } });
        const uploadJob = await prisma.uploadJob.create({ data: { ...target, videoId: video.id, fileName, status: 'PENDING', message: 'Queued' } });
        await transcodeQueue.add('transcode-video', { uploadJobId: uploadJob.id, videoId: video.id, inputPath: tmpPath, ...target }, { removeOnComplete: true, attempts: 2 });
        settled = true;
        resolve({ uploadJobId: uploadJob.id, videoId: video.id });
      } catch (error) {
        fail(error);
      }
    });

    req.pipe(busboy);
  });
}

adminRouter.post('/content/:id/video', asyncHandler(async (req, res) => {
  const id = requireParam(req, 'id');
  const content = await prisma.content.findUnique({ where: { id } });
  if (!content) throw new AppError(404, 'CONTENT_NOT_FOUND', 'Content not found');
  const job = await receiveVideoUpload(req, { contentId: content.id });
  res.status(202).json(job);
}));

adminRouter.post('/content/:id/seasons/:season/episodes/:ep/video', asyncHandler(async (req, res) => {
  const id = requireParam(req, 'id');
  const seasonNumber = requireIntParam(req, 'season');
  const episodeNumber = requireIntParam(req, 'ep');
  const season = await prisma.season.findUnique({ where: { contentId_number: { contentId: id, number: seasonNumber } } });
  if (!season) throw new AppError(404, 'SEASON_NOT_FOUND', 'Season not found');
  const episode = await prisma.episode.findUnique({ where: { seasonId_number: { seasonId: season.id, number: episodeNumber } } });
  if (!episode) throw new AppError(404, 'EPISODE_NOT_FOUND', 'Episode not found');
  const job = await receiveVideoUpload(req, { episodeId: episode.id, contentId: id });
  res.status(202).json(job);
}));

adminRouter.get('/uploads/status/:jobId', asyncHandler(async (req, res) => {
  const jobId = requireParam(req, 'jobId');
  const job = await prisma.uploadJob.findUnique({ where: { id: jobId } });
  if (!job) throw new AppError(404, 'UPLOAD_NOT_FOUND', 'Upload job not found');
  res.json({ job });
}));

adminRouter.get('/uploads', asyncHandler(async (_req, res) => {
  const jobs = await prisma.uploadJob.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { content: true, episode: true } });
  res.json({ jobs });
}));

const platforms = ['WINDOWS', 'MAC', 'LINUX', 'ANDROID', 'IOS', 'WEB', 'MULTI'] as const;
const downloadCategories = ['GAME', 'SOFTWARE'] as const;
const allowedDownloadExtensions = new Set([
  'zip', '7z', 'rar', 'tar', 'gz', 'xz', 'bz2',
  'exe', 'msi', 'dmg', 'pkg', 'apk', 'deb', 'rpm', 'appimage', 'snap', 'flatpak', 'jar',
  'bin', 'iso', 'img'
]);
const downloadFieldsSchema = z.object({
  category: z.enum(downloadCategories),
  title: z.string().min(1).max(140),
  description: z.string().min(1).max(2000),
  platform: z.enum(platforms).default('WINDOWS'),
  version: z.string().max(40).optional(),
  developer: z.string().max(120).optional(),
  genre: z.string().max(60).optional(),
  coverImageUrl: z.string().url(),
  isPublished: z.enum(['true', 'false']).optional(),
  isFeatured: z.enum(['true', 'false']).optional(),
  isTrending: z.enum(['true', 'false']).optional(),
  isTopRanked: z.enum(['true', 'false']).optional(),
  rank: z.coerce.number().int().min(1).max(100).optional()
});

const MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024 * 1024;

function fileExtension(name: string) {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

async function receiveDownloadUpload(req: import('express').Request) {
  const uploadDir = path.join(env.LOCAL_MEDIA_DIR, 'uploads');
  await fsp.mkdir(uploadDir, { recursive: true });
  return new Promise<Awaited<ReturnType<typeof prisma.download.create>>>((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_DOWNLOAD_BYTES } });
    const fields: Record<string, string> = {};
    let settled = false;
    let sawFile = false;
    let limited = false;
    let originalName = '';
    let safeBase = '';
    let tmpPath: string | undefined;
    let total = 0n;
    let writeResolve: () => void = () => undefined;
    const writeDone = new Promise<void>((r) => { writeResolve = r; });

    function fail(error: unknown) {
      if (settled) return;
      settled = true;
      if (tmpPath) void fsp.rm(tmpPath, { force: true }).catch(() => undefined);
      reject(error);
    }

    busboy.on('field', (name, value) => { fields[name] = value; });

    busboy.on('file', (_field, file, info) => {
      sawFile = true;
      originalName = path.basename(info.filename || 'download.bin');
      const extension = fileExtension(originalName);
      if (!allowedDownloadExtensions.has(extension)) {
        file.resume();
        fail(new AppError(400, 'BAD_FILE_TYPE', `Unsupported file type: .${extension || 'unknown'}`));
        return;
      }
      safeBase = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
      tmpPath = path.join(uploadDir, `${Date.now()}-${safeBase}`);
      const writeStream = fs.createWriteStream(tmpPath);
      file.on('data', (chunk: Buffer) => { total += BigInt(chunk.length); });
      file.on('limit', () => {
        limited = true;
        file.unpipe(writeStream);
        file.resume();
        writeStream.destroy();
        fail(new AppError(413, 'FILE_TOO_LARGE', 'File exceeds the 5GB limit'));
      });
      file.pipe(writeStream);
      writeStream.on('error', (error) => fail(error));
      writeStream.on('finish', () => writeResolve());
    });

    busboy.on('error', fail);
    busboy.on('close', async () => {
      if (settled || limited) return;
      if (!sawFile || !tmpPath) {
        fail(new AppError(400, 'NO_FILE', 'No file uploaded'));
        return;
      }
      await writeDone;
      if (settled) return;
      try {
        const parsed = downloadFieldsSchema.parse(fields);
        const slug = slugify(parsed.title);
        if (!slug) throw new AppError(400, 'BAD_TITLE', 'Title must contain alphanumeric characters');
        const existing = await prisma.download.findUnique({ where: { category_slug: { category: parsed.category, slug } } });
        if (existing) throw new AppError(409, 'SLUG_TAKEN', 'An item with a similar title already exists in this category');
        const storageKey = `downloads/${parsed.category.toLowerCase()}/${slug}/${safeBase}`;
        const fileUrl = await putObject(storageKey, tmpPath);
        await fsp.rm(tmpPath, { force: true }).catch(() => undefined);
        const download = await prisma.download.create({
          data: {
            category: parsed.category,
            title: parsed.title,
            slug,
            description: parsed.description,
            platform: parsed.platform,
            version: parsed.version || null,
            developer: parsed.developer || null,
            genre: parsed.genre || null,
            coverImageUrl: parsed.coverImageUrl,
            fileName: originalName,
            fileUrl,
            storageKey,
            fileSize: total,
            isPublished: parsed.isPublished ? parsed.isPublished === 'true' : true,
            isFeatured: parsed.isFeatured === 'true',
            isTrending: parsed.isTrending === 'true',
            isTopRanked: parsed.isTopRanked === 'true',
            rank: parsed.rank ?? null
          }
        });
        settled = true;
        resolve(download);
      } catch (error) {
        fail(error);
      }
    });

    req.pipe(busboy);
  });
}

adminRouter.get('/downloads', asyncHandler(async (req, res) => {
  const query = parseQuery(req, z.object({ category: z.enum(downloadCategories).optional() }));
  const items = await prisma.download.findMany({ where: query.category ? { category: query.category } : {}, orderBy: { createdAt: 'desc' } });
  res.json({ items: items.map(toDownloadDto) });
}));

adminRouter.post('/downloads', asyncHandler(async (req, res) => {
  const download = await receiveDownloadUpload(req);
  res.status(201).json({ item: toDownloadDto(download) });
}));

adminRouter.patch('/downloads/:id', asyncHandler(async (req, res) => {
  const id = requireParam(req, 'id');
  const body = parseBody(req, z.object({
    title: z.string().min(1).max(140).optional(),
    description: z.string().min(1).max(2000).optional(),
    platform: z.enum(platforms).optional(),
    version: z.string().max(40).nullable().optional(),
    developer: z.string().max(120).nullable().optional(),
    genre: z.string().max(60).nullable().optional(),
    coverImageUrl: z.string().url().optional(),
    isPublished: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
    isTrending: z.boolean().optional(),
    isTopRanked: z.boolean().optional(),
    rank: z.number().int().min(1).max(100).nullable().optional()
  }));
  const current = await prisma.download.findUnique({ where: { id } });
  if (!current) throw new AppError(404, 'DOWNLOAD_NOT_FOUND', 'Download not found');
  const data: Prisma.DownloadUpdateInput = pickDefined(body, [
    'description', 'platform', 'version', 'developer', 'genre',
    'coverImageUrl', 'isPublished', 'isFeatured', 'isTrending', 'isTopRanked', 'rank'
  ]);
  if (body.title !== undefined) { data.title = body.title; data.slug = slugify(body.title); }
  const download = await prisma.download.update({ where: { id }, data });
  res.json({ item: toDownloadDto(download) });
}));

adminRouter.delete('/downloads/:id', asyncHandler(async (req, res) => {
  const id = requireParam(req, 'id');
  const download = await prisma.download.findUnique({ where: { id } });
  if (!download) throw new AppError(404, 'DOWNLOAD_NOT_FOUND', 'Download not found');
  await prisma.download.delete({ where: { id } });
  const folderKey = download.storageKey.split('/').slice(0, -1).join('/');
  if (folderKey) await deleteObjectByKey(folderKey).catch(() => undefined);
  res.status(204).send();
}));
