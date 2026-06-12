import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/jwt.js';

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; email: string; role: 'USER' | 'ADMIN' };
      activeProfileId?: string;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.header('Authorization');
  if (!header?.startsWith('Bearer ')) return next(new AppError(401, 'UNAUTHENTICATED', 'Missing bearer token'));
  const token = header.slice('Bearer '.length);
  try {
    const payload = verifyAccessToken(token);
    req.auth = { userId: payload.sub, email: payload.email, role: payload.role };
    const profileId = req.header('x-profile-id');
    if (profileId) req.activeProfileId = profileId;
    return next();
  } catch {
    return next(new AppError(401, 'INVALID_TOKEN', 'Access token is invalid or expired'));
  }
}

export async function requireActiveProfile(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) return next(new AppError(401, 'UNAUTHENTICATED', 'Authentication required'));
  const profileId = req.activeProfileId;
  if (!profileId) return next(new AppError(400, 'PROFILE_REQUIRED', 'x-profile-id header is required'));
  const profile = await prisma.profile.findFirst({ where: { id: profileId, userId: req.auth.userId } });
  if (!profile) return next(new AppError(403, 'PROFILE_FORBIDDEN', 'Profile does not belong to this user'));
  return next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) return next(new AppError(401, 'UNAUTHENTICATED', 'Authentication required'));
  if (req.auth.role !== 'ADMIN') return next(new AppError(403, 'ADMIN_ONLY', 'Admin access required'));
  return next();
}
