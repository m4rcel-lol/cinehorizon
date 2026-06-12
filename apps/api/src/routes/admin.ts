import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import Busboy from 'busboy';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import { parseBody, parseQuery } from '../lib/validate.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { slugify } from '../lib/slug.js';
import { toContentCardDto, toUserDto } from '../lib/mappers.js';
import { assertMagicBytes } from '../middleware/uploadGuard.js';
import { env } from '../config/env.js';
import { transcodeQueue } from '../queues/transcodeQueue.js';
import { deleteObjectByKey } from '../services/storage.js';

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

adminRouter.get('/stats', asyncHandler(async (_req, res) => {
  const [users, movies, series, activeSessions, storageAgg] = await Promise.all([
    prisma.user.count(),
    prisma.content.count({ where: { type: 'MOVIE' } }),
    prisma.content.count({ where: { type: 'SERIES' } }),
    prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
    prisma.video.aggregate({ _sum: { size: true } })
  ]);
  res.json({ totalUsers: users, totalContent: movies + series, movies, series, activeSessions, storageBytes: Number(storageAgg._sum.size ?? 0n) });
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
  const user = await prisma.user.update({ where: { id: req.params.id }, data: body });
  res.json({ user: toUserDto(user) });
}));

adminRouter.delete('/users/:id', asyncHandler(async (req, res) => {
  if (req.params.id === req.auth!.userId) throw new AppError(400, 'SELF_DELETE_FORBIDDEN', 'You cannot delete your own admin account');
  await prisma.user.delete({ where: { id: req.params.id } });
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

adminRouter.get('/content', asyncHandler(async (req, res) => {
  const query = parseQuery(req, contentListSchema);
  const where = { ...(query.status ? { status: query.status } : {}), ...(query.type ? { type: query.type } : {}), ...(query.q ? { title: { contains: query.q, mode: 'insensitive' as const } } : {}) };
  const [items, total] = await Promise.all([
    prisma.content.findMany({ where, include: { genres: true }, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }),
    prisma.content.count({ where })
  ]);
  res.json({ items: items.map(toContentCardDto), total, page: query.page, limit: query.limit });
}));

adminRouter.post('/content', asyncHandler(async (req, res) => {
  const body = parseBody(req, contentSchema);
  const content = await prisma.content.create({
    data: {
      title: body.title,
      slug: body.slug ? slugify(body.slug) : slugify(body.title),
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
      cast: { create: body.cast }
    },
    include: { genres: true }
  });
  res.status(201).json({ content: toContentCardDto(content) });
}));

adminRouter.patch('/content/:id', asyncHandler(async (req, res) => {
  const body = parseBody(req, contentPatchSchema);
  const content = await prisma.content.update({
    where: { id: req.params.id },
    data: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.slug !== undefined ? { slug: slugify(body.slug) } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.type !== undefined ? { type: body.type } : {}),
      ...(body.releaseYear !== undefined ? { releaseYear: body.releaseYear } : {}),
      ...(body.ageRating !== undefined ? { ageRating: body.ageRating } : {}),
      ...(body.durationMinutes !== undefined ? { durationMinutes: body.durationMinutes } : {}),
      ...(body.backdropUrl !== undefined ? { backdropUrl: body.backdropUrl } : {}),
      ...(body.posterUrl !== undefined ? { posterUrl: body.posterUrl } : {}),
      ...(body.logoUrl !== undefined ? { logoUrl: body.logoUrl } : {}),
      ...(body.trailerUrl !== undefined ? { trailerUrl: body.trailerUrl } : {}),
      ...(body.isFeatured !== undefined ? { isFeatured: body.isFeatured } : {}),
      ...(body.isOriginal !== undefined ? { isOriginal: body.isOriginal } : {}),
      ...(body.isTrending !== undefined ? { isTrending: body.isTrending } : {}),
      ...(body.isTopTen !== undefined ? { isTopTen: body.isTopTen } : {}),
      ...(body.topTenRank !== undefined ? { topTenRank: body.topTenRank } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.maturityTags !== undefined ? { maturityTags: body.maturityTags } : {}),
      ...(body.genreIds !== undefined ? { genres: { set: body.genreIds.map((id) => ({ id })) } } : {})
    },
    include: { genres: true }
  });
  if (body.cast !== undefined) {
    await prisma.castMember.deleteMany({ where: { contentId: content.id } });
    if (body.cast.length) await prisma.castMember.createMany({ data: body.cast.map((c) => ({ ...c, contentId: content.id })) });
  }
  res.json({ content: toContentCardDto(content) });
}));

adminRouter.delete('/content/:id', asyncHandler(async (req, res) => {
  const videos = await prisma.video.findMany({ where: { contentId: req.params.id } });
  await prisma.content.delete({ where: { id: req.params.id } });
  await Promise.all(videos.map((video) => video.storageKey ? deleteObjectByKey(video.storageKey.split('/master.m3u8')[0]!) : Promise.resolve()));
  res.status(204).send();
}));

adminRouter.post('/content/:id/seasons/:season/episodes', asyncHandler(async (req, res) => {
  const body = parseBody(req, episodeSchema);
  const content = await prisma.content.findUnique({ where: { id: req.params.id } });
  if (!content) throw new AppError(404, 'CONTENT_NOT_FOUND', 'Content not found');
  const season = await prisma.season.upsert({ where: { contentId_number: { contentId: content.id, number: Number(req.params.season) } }, update: {}, create: { contentId: content.id, number: Number(req.params.season), title: `Season ${req.params.season}` } });
  const episode = await prisma.episode.create({ data: { ...body, seasonId: season.id } });
  res.status(201).json({ episode });
}));

async function receiveVideoUpload(req: import('express').Request, target: { contentId?: string; episodeId?: string }) {
  await fsp.mkdir(path.join(env.LOCAL_MEDIA_DIR, 'uploads'), { recursive: true });
  return new Promise<{ uploadJobId: string; videoId: string }>((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers, limits: { files: 1, fileSize: 5 * 1024 * 1024 * 1024 } });
    let resolved = false;

    busboy.on('file', (_field, file, info) => {
      const mime = info.mimeType;
      if (!['video/mp4', 'video/webm', 'video/quicktime'].includes(mime)) {
        file.resume();
        reject(new AppError(400, 'BAD_VIDEO_TYPE', 'Only MP4, WebM, and MOV videos are allowed'));
        return;
      }
      const tmpPath = path.join(env.LOCAL_MEDIA_DIR, 'uploads', `${Date.now()}-${info.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
      const writeStream = fs.createWriteStream(tmpPath);
      const chunks: Buffer[] = [];
      let total = 0n;
      file.on('data', (chunk: Buffer) => {
        if (Buffer.concat(chunks).length < 12) chunks.push(chunk.subarray(0, Math.max(0, 12 - Buffer.concat(chunks).length)));
        total += BigInt(chunk.length);
      });
      file.pipe(writeStream);
      writeStream.on('finish', async () => {
        try {
          const magic = Buffer.concat(chunks).subarray(0, 12);
          assertMagicBytes(magic, mime, 'video');
          const video = await prisma.video.create({ data: { ...target, quality: 'FHD_1080', url: '', size: total, mimeType: mime, status: 'PENDING' } });
          const uploadJob = await prisma.uploadJob.create({ data: { ...target, videoId: video.id, fileName: info.filename, status: 'PENDING', message: 'Queued' } });
          await transcodeQueue.add('transcode-video', { uploadJobId: uploadJob.id, videoId: video.id, inputPath: tmpPath, ...target }, { removeOnComplete: true, attempts: 2 });
          resolved = true;
          resolve({ uploadJobId: uploadJob.id, videoId: video.id });
        } catch (error) {
          reject(error);
        }
      });
    });

    busboy.on('finish', () => { if (!resolved) reject(new AppError(400, 'NO_FILE', 'No video file uploaded')); });
    busboy.on('error', reject);
    req.pipe(busboy);
  });
}

adminRouter.post('/content/:id/video', asyncHandler(async (req, res) => {
  const content = await prisma.content.findUnique({ where: { id: req.params.id } });
  if (!content) throw new AppError(404, 'CONTENT_NOT_FOUND', 'Content not found');
  const job = await receiveVideoUpload(req, { contentId: content.id });
  res.status(202).json(job);
}));

adminRouter.post('/content/:id/seasons/:season/episodes/:ep/video', asyncHandler(async (req, res) => {
  const season = await prisma.season.findUnique({ where: { contentId_number: { contentId: req.params.id, number: Number(req.params.season) } } });
  if (!season) throw new AppError(404, 'SEASON_NOT_FOUND', 'Season not found');
  const episode = await prisma.episode.findUnique({ where: { seasonId_number: { seasonId: season.id, number: Number(req.params.ep) } } });
  if (!episode) throw new AppError(404, 'EPISODE_NOT_FOUND', 'Episode not found');
  const job = await receiveVideoUpload(req, { episodeId: episode.id, contentId: req.params.id });
  res.status(202).json(job);
}));

adminRouter.get('/uploads/status/:jobId', asyncHandler(async (req, res) => {
  const job = await prisma.uploadJob.findUnique({ where: { id: req.params.jobId } });
  if (!job) throw new AppError(404, 'UPLOAD_NOT_FOUND', 'Upload job not found');
  res.json({ job });
}));

adminRouter.get('/uploads', asyncHandler(async (_req, res) => {
  const jobs = await prisma.uploadJob.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { content: true, episode: true } });
  res.json({ jobs });
}));
