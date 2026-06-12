import { Router } from 'express';
import { z } from 'zod';
import { addDays } from 'date-fns';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import { parseBody } from '../lib/validate.js';
import { hashPassword, verifyPassword } from '../lib/passwords.js';
import { randomToken, sha256 } from '../lib/crypto.js';
import { signAccessToken } from '../lib/jwt.js';
import { toProfileDto, toUserDto } from '../lib/mappers.js';
import { env, isProduction } from '../config/env.js';
import { authLimiter } from '../middleware/security.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

authRouter.use(['/login', '/register', '/refresh'], authLimiter);

const registerSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase()),
  password: z.string().min(8).max(128),
  displayName: z.string().min(2).max(64)
});

const loginSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase()),
  password: z.string().min(1)
});

const verifySchema = z.object({ token: z.string().min(16) });

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict' as const,
    path: '/api/v1/auth',
    domain: env.COOKIE_DOMAIN || undefined,
    maxAge: env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000
  };
}

async function createSession(userId: string, req: import('express').Request) {
  const rawToken = randomToken(64);
  const expiresAt = addDays(new Date(), env.REFRESH_TOKEN_DAYS);
  await prisma.session.create({
    data: {
      userId,
      token: sha256(rawToken),
      userAgent: req.header('user-agent') ?? null,
      ipAddress: req.ip ?? null,
      expiresAt
    }
  });
  return rawToken;
}

async function issueAuth(user: { id: string; email: string; role: 'USER' | 'ADMIN' }, req: import('express').Request, res: import('express').Response) {
  const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role });
  const refreshToken = await createSession(user.id, req);
  res.cookie('ch_refresh', refreshToken, refreshCookieOptions());
  return accessToken;
}

authRouter.post('/register', asyncHandler(async (req, res) => {
  const body = parseBody(req, registerSchema);
  const exists = await prisma.user.findUnique({ where: { email: body.email } });
  if (exists) throw new AppError(409, 'EMAIL_TAKEN', 'Email is already registered');
  const verificationRaw = randomToken(32);
  const user = await prisma.user.create({
    data: {
      email: body.email,
      displayName: body.displayName,
      passwordHash: await hashPassword(body.password),
      profiles: { create: { name: body.displayName.slice(0, 24), avatarIndex: 0 } },
      verificationTokens: { create: { tokenHash: sha256(verificationRaw), expiresAt: addDays(new Date(), 1) } }
    },
    include: { profiles: true }
  });
  const accessToken = await issueAuth({ id: user.id, email: user.email, role: user.role }, req, res);
  res.status(201).json({ user: toUserDto(user), profiles: user.profiles.map(toProfileDto), accessToken, devVerificationToken: isProduction ? undefined : verificationRaw });
}));

authRouter.post('/login', asyncHandler(async (req, res) => {
  const body = parseBody(req, loginSchema);
  const user = await prisma.user.findUnique({ where: { email: body.email }, include: { profiles: true } });
  if (!user || !(await verifyPassword(body.password, user.passwordHash))) throw new AppError(401, 'BAD_CREDENTIALS', 'Invalid email or password');
  const accessToken = await issueAuth({ id: user.id, email: user.email, role: user.role }, req, res);
  res.json({ user: toUserDto(user), profiles: user.profiles.map(toProfileDto), accessToken });
}));

authRouter.post('/refresh', asyncHandler(async (req, res) => {
  const raw = req.cookies?.ch_refresh as string | undefined;
  if (!raw) throw new AppError(401, 'NO_REFRESH_TOKEN', 'Missing refresh token');
  const tokenHash = sha256(raw);
  const session = await prisma.session.findUnique({ where: { token: tokenHash }, include: { user: { include: { profiles: true } } } });
  if (!session || session.expiresAt < new Date()) throw new AppError(401, 'REFRESH_EXPIRED', 'Refresh token is invalid or expired');
  await prisma.session.delete({ where: { id: session.id } });
  const accessToken = await issueAuth({ id: session.user.id, email: session.user.email, role: session.user.role }, req, res);
  res.json({ user: toUserDto(session.user), profiles: session.user.profiles.map(toProfileDto), accessToken });
}));

authRouter.post('/logout', asyncHandler(async (req, res) => {
  const raw = req.cookies?.ch_refresh as string | undefined;
  if (raw) await prisma.session.deleteMany({ where: { token: sha256(raw) } });
  res.clearCookie('ch_refresh', refreshCookieOptions());
  res.status(204).send();
}));

authRouter.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId }, include: { profiles: true } });
  res.json({ user: toUserDto(user), profiles: user.profiles.map(toProfileDto) });
}));

authRouter.post('/verify-email', asyncHandler(async (req, res) => {
  const { token } = parseBody(req, verifySchema);
  const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) throw new AppError(400, 'BAD_VERIFICATION_TOKEN', 'Verification token is invalid or expired');
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { isVerified: true } }),
    prisma.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } })
  ]);
  res.json({ ok: true });
}));
