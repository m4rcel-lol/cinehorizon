import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { env, isProduction } from '../config/env.js';
import { AppError } from '../lib/errors.js';

export const authLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });
export const apiLimiter = rateLimit({ windowMs: 60_000, limit: 100, standardHeaders: true, legacyHeaders: false });

const allowedOrigins = new Set([env.WEB_ORIGIN, env.ADMIN_ORIGIN, env.BASE_URL].filter(Boolean));

export function verifyOrigin(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (!isProduction) return next();
  const origin = req.header('Origin');
  if (!origin || allowedOrigins.has(origin)) return next();
  next(new AppError(403, 'BAD_ORIGIN', 'Request origin is not allowed'));
}
