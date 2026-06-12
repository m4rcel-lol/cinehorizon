import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
export const healthRouter = Router();
healthRouter.get('/', asyncHandler(async (_req, res) => {
    await prisma.$queryRaw `SELECT 1`;
    const pong = await redis.ping();
    res.json({ status: 'ok', db: 'ok', redis: pong === 'PONG' ? 'ok' : 'degraded', uptime: process.uptime() });
}));
//# sourceMappingURL=health.js.map