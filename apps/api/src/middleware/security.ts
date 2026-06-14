import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { isProduction } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { isOriginAllowed } from '../lib/origins.js';

export const authLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });
export const apiLimiter = rateLimit({ windowMs: 60_000, limit: 100, standardHeaders: true, legacyHeaders: false });

export function verifyOrigin(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (!isProduction) return next();
  const origin = req.header('Origin');
  if (!origin || isOriginAllowed(origin, req)) return next();
  next(new AppError(403, 'BAD_ORIGIN', 'Request origin is not allowed'));
}
