import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import { parseBody, requireParam } from '../lib/validate.js';
import { toProfileDto } from '../lib/mappers.js';
import { requireAuth } from '../middleware/auth.js';

export const profileRouter = Router();
profileRouter.use(requireAuth);

const profileSchema = z.object({ name: z.string().min(1).max(24), avatarIndex: z.number().int().min(0).max(9).default(0), isKids: z.boolean().default(false) });
const profilePatchSchema = profileSchema.partial();

profileRouter.get('/', asyncHandler(async (req, res) => {
  const profiles = await prisma.profile.findMany({ where: { userId: req.auth!.userId }, orderBy: { createdAt: 'asc' } });
  res.json({ profiles: profiles.map(toProfileDto) });
}));

profileRouter.post('/', asyncHandler(async (req, res) => {
  const body = parseBody(req, profileSchema);
  const count = await prisma.profile.count({ where: { userId: req.auth!.userId } });
  if (count >= 5) throw new AppError(400, 'PROFILE_LIMIT', 'Maximum of 5 profiles reached');
  const profile = await prisma.profile.create({ data: { ...body, userId: req.auth!.userId } });
  res.status(201).json({ profile: toProfileDto(profile) });
}));

profileRouter.patch('/:id', asyncHandler(async (req, res) => {
  const body = parseBody(req, profilePatchSchema);
  const id = requireParam(req, 'id');
  const profile = await prisma.profile.findFirst({ where: { id, userId: req.auth!.userId } });
  if (!profile) throw new AppError(404, 'PROFILE_NOT_FOUND', 'Profile not found');
  const data: Prisma.ProfileUpdateInput = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.avatarIndex !== undefined) data.avatarIndex = body.avatarIndex;
  if (body.isKids !== undefined) data.isKids = body.isKids;
  const updated = await prisma.profile.update({ where: { id: profile.id }, data });
  res.json({ profile: toProfileDto(updated) });
}));

profileRouter.delete('/:id', asyncHandler(async (req, res) => {
  const id = requireParam(req, 'id');
  const profile = await prisma.profile.findFirst({ where: { id, userId: req.auth!.userId } });
  if (!profile) throw new AppError(404, 'PROFILE_NOT_FOUND', 'Profile not found');
  const count = await prisma.profile.count({ where: { userId: req.auth!.userId } });
  if (count <= 1) throw new AppError(400, 'LAST_PROFILE', 'Cannot delete the last profile');
  await prisma.profile.delete({ where: { id: profile.id } });
  res.status(204).send();
}));
