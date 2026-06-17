import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import Busboy from 'busboy';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import { parseBody, parseQuery, requireIntParam, requireParam } from '../lib/validate.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { slugify } from '../lib/slug.js';
import { toContentCardDto, toGameDto, toUserDto } from '../lib/mappers.js';
import { assertMagicBytes } from '../middleware/uploadGuard.js';
import { env } from '../config/env.js';
import { transcodeQueue } from '../queues/transcodeQueue.js';
import { deleteObjectByKey, putObject } from '../services/storage.js';
import { compressImageToWebp } from '../services/imageCompression.js';

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
  if (body.slug !== undefined) data.slug = slugify(body.slug);
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
  await Promise.all(videos.map((video) => video.storageKey ? deleteObjectByKey(video.storageKey.split('/master.m3u8')[0]!) : Promise.resolve()));
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
          await fsp.rm(tmpPath, { force: true }).catch(() => undefined);
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

const gamePlatforms = ['WINDOWS', 'MAC', 'LINUX', 'ANDROID', 'MULTI'] as const;
const allowedGameExtensions = new Set(['zip', '7z', 'rar', 'exe', 'msi', 'dmg', 'pkg', 'apk', 'deb', 'appimage', 'bin', 'iso', 'tar', 'gz']);
const gameFieldsSchema = z.object({
  title: z.string().min(1).max(140),
  description: z.string().min(1).max(2000),
  platform: z.enum(gamePlatforms).default('WINDOWS'),
  version: z.string().max(40).optional(),
  developer: z.string().max(120).optional(),
  genre: z.string().max(60).optional(),
  coverImageUrl: z.string().url(),
  isPublished: z.enum(['true', 'false']).optional()
});

const MAX_GAME_BYTES = 5 * 1024 * 1024 * 1024;

function fileExtension(name: string) {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

async function receiveGameUpload(req: import('express').Request) {
  const uploadDir = path.join(env.LOCAL_MEDIA_DIR, 'uploads');
  await fsp.mkdir(uploadDir, { recursive: true });
  return new Promise<Awaited<ReturnType<typeof prisma.game.create>>>((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_GAME_BYTES } });
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
      originalName = path.basename(info.filename || 'game.bin');
      const extension = fileExtension(originalName);
      if (!allowedGameExtensions.has(extension)) {
        file.resume();
        fail(new AppError(400, 'BAD_GAME_TYPE', `Unsupported game file type: .${extension || 'unknown'}`));
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
        fail(new AppError(413, 'GAME_TOO_LARGE', 'Game file exceeds the 5GB limit'));
      });
      file.pipe(writeStream);
      writeStream.on('error', (error) => fail(error));
      writeStream.on('finish', () => writeResolve());
    });

    busboy.on('error', fail);
    busboy.on('close', async () => {
      if (settled || limited) return;
      if (!sawFile || !tmpPath) {
        fail(new AppError(400, 'NO_FILE', 'No game file uploaded'));
        return;
      }
      await writeDone;
      if (settled) return;
      try {
        const parsed = gameFieldsSchema.parse(fields);
        const slug = slugify(parsed.title);
        if (!slug) throw new AppError(400, 'BAD_GAME_TITLE', 'Title must contain alphanumeric characters');
        const existing = await prisma.game.findUnique({ where: { slug } });
        if (existing) throw new AppError(409, 'GAME_SLUG_TAKEN', 'A game with a similar title already exists');
        const storageKey = `games/${slug}/${safeBase}`;
        const fileUrl = await putObject(storageKey, tmpPath);
        await fsp.rm(tmpPath, { force: true }).catch(() => undefined);
        const game = await prisma.game.create({
          data: {
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
            isPublished: parsed.isPublished ? parsed.isPublished === 'true' : true
          }
        });
        settled = true;
        resolve(game);
      } catch (error) {
        fail(error);
      }
    });

    req.pipe(busboy);
  });
}

adminRouter.get('/games', asyncHandler(async (_req, res) => {
  const games = await prisma.game.findMany({ orderBy: { createdAt: 'desc' } });
  res.json({ games: games.map(toGameDto) });
}));

adminRouter.post('/games', asyncHandler(async (req, res) => {
  const game = await receiveGameUpload(req);
  res.status(201).json({ game: toGameDto(game) });
}));

adminRouter.patch('/games/:id', asyncHandler(async (req, res) => {
  const id = requireParam(req, 'id');
  const body = parseBody(req, z.object({
    title: z.string().min(1).max(140).optional(),
    description: z.string().min(1).max(2000).optional(),
    platform: z.enum(gamePlatforms).optional(),
    version: z.string().max(40).nullable().optional(),
    developer: z.string().max(120).nullable().optional(),
    genre: z.string().max(60).nullable().optional(),
    coverImageUrl: z.string().url().optional(),
    isPublished: z.boolean().optional()
  }));
  const data: Prisma.GameUpdateInput = {};
  if (body.title !== undefined) { data.title = body.title; data.slug = slugify(body.title); }
  if (body.description !== undefined) data.description = body.description;
  if (body.platform !== undefined) data.platform = body.platform;
  if (body.version !== undefined) data.version = body.version;
  if (body.developer !== undefined) data.developer = body.developer;
  if (body.genre !== undefined) data.genre = body.genre;
  if (body.coverImageUrl !== undefined) data.coverImageUrl = body.coverImageUrl;
  if (body.isPublished !== undefined) data.isPublished = body.isPublished;
  const game = await prisma.game.update({ where: { id }, data });
  res.json({ game: toGameDto(game) });
}));

adminRouter.delete('/games/:id', asyncHandler(async (req, res) => {
  const id = requireParam(req, 'id');
  const game = await prisma.game.findUnique({ where: { id } });
  if (!game) throw new AppError(404, 'GAME_NOT_FOUND', 'Game not found');
  await prisma.game.delete({ where: { id } });
  const folderKey = game.storageKey.split('/').slice(0, -1).join('/');
  if (folderKey) await deleteObjectByKey(folderKey).catch(() => undefined);
  res.status(204).send();
}));
