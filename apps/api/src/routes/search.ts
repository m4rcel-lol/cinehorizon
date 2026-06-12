import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { parseQuery } from '../lib/validate.js';
import { toContentCardDto } from '../lib/mappers.js';

export const searchRouter = Router();
const querySchema = z.object({ q: z.string().min(1).max(100) });

searchRouter.get('/', asyncHandler(async (req, res) => {
  const { q } = parseQuery(req, querySchema);
  const items = await prisma.content.findMany({
    where: { status: 'PUBLISHED', OR: [{ title: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }, { cast: { some: { name: { contains: q, mode: 'insensitive' } } } }] },
    include: { genres: true, cast: true },
    take: 30
  });
  res.json({
    movies: items.filter((i) => i.type === 'MOVIE').map(toContentCardDto),
    series: items.filter((i) => i.type === 'SERIES').map(toContentCardDto),
    people: Array.from(new Set(items.flatMap((i) => i.cast.map((c) => c.name).filter((name) => name.toLowerCase().includes(q.toLowerCase())))))
  });
}));
