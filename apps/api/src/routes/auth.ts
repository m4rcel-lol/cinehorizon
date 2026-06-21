import { Router } from 'express';
import { z } from 'zod';
import { addDays } from 'date-fns';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import { parseBody, requireParam } from '../lib/validate.js';
import { hashPassword, verifyPassword } from '../lib/passwords.js';
import { randomToken, sha256 } from '../lib/crypto.js';
import { signAccessToken } from '../lib/jwt.js';
import { toProfileDto, toUserDto } from '../lib/mappers.js';
import { env, isProduction } from '../config/env.js';
import { authLimiter } from '../middleware/security.js';
import { requireAuth } from '../middleware/auth.js';
import { sendPasswordResetEmail, sendVerificationEmail } from '../services/email.js';

export const authRouter = Router();

authRouter.use(['/login', '/register', '/refresh', '/forgot-password', '/reset-password'], authLimiter);

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
const forgotSchema = z.object({ email: z.string().email().transform((v) => v.toLowerCase()) });
const resetSchema = z.object({ token: z.string().min(16), password: z.string().min(8).max(128) });
const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(128) });

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
  await sendVerificationEmail(user.email, verificationRaw).catch((error) => console.error('Failed to send verification email', error));
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

authRouter.post('/resend-verification', requireAuth, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId } });
  if (user.isVerified) return res.json({ ok: true, alreadyVerified: true });
  const verificationRaw = randomToken(32);
  await prisma.emailVerificationToken.create({ data: { userId: user.id, tokenHash: sha256(verificationRaw), expiresAt: addDays(new Date(), 1) } });
  await sendVerificationEmail(user.email, verificationRaw).catch((error) => console.error('Failed to send verification email', error));
  return res.json({ ok: true, devVerificationToken: isProduction ? undefined : verificationRaw });
}));

authRouter.post('/forgot-password', asyncHandler(async (req, res) => {
  const { email } = parseBody(req, forgotSchema);
  const user = await prisma.user.findUnique({ where: { email } });
  // Always return ok so the endpoint can't be used to enumerate accounts.
  if (user) {
    const resetRaw = randomToken(32);
    await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: sha256(resetRaw), expiresAt: new Date(Date.now() + 60 * 60 * 1000) } });
    await sendPasswordResetEmail(user.email, resetRaw).catch((error) => console.error('Failed to send reset email', error));
    if (!isProduction) return res.json({ ok: true, devResetToken: resetRaw });
  }
  return res.json({ ok: true });
}));

authRouter.post('/reset-password', asyncHandler(async (req, res) => {
  const { token, password } = parseBody(req, resetSchema);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) throw new AppError(400, 'BAD_RESET_TOKEN', 'Reset link is invalid or expired');
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash: await hashPassword(password) } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // Revoke every existing session so a leaked password can't keep a session alive.
    prisma.session.deleteMany({ where: { userId: record.userId } })
  ]);
  res.json({ ok: true });
}));

authRouter.post('/change-password', requireAuth, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = parseBody(req, changePasswordSchema);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId } });
  if (!(await verifyPassword(currentPassword, user.passwordHash))) throw new AppError(400, 'BAD_CURRENT_PASSWORD', 'Current password is incorrect');
  const currentToken = req.cookies?.ch_refresh as string | undefined;
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } });
  // Keep the current device signed in, drop the rest.
  await prisma.session.deleteMany({ where: { userId: user.id, ...(currentToken ? { token: { not: sha256(currentToken) } } : {}) } });
  res.json({ ok: true });
}));

authRouter.get('/sessions', requireAuth, asyncHandler(async (req, res) => {
  const currentToken = req.cookies?.ch_refresh as string | undefined;
  const currentHash = currentToken ? sha256(currentToken) : undefined;
  const sessions = await prisma.session.findMany({ where: { userId: req.auth!.userId }, orderBy: { createdAt: 'desc' } });
  res.json({
    sessions: sessions.map((session) => ({
      id: session.id,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      current: session.token === currentHash
    }))
  });
}));

authRouter.delete('/sessions/:id', requireAuth, asyncHandler(async (req, res) => {
  const id = requireParam(req, 'id');
  const session = await prisma.session.findFirst({ where: { id, userId: req.auth!.userId } });
  if (!session) throw new AppError(404, 'SESSION_NOT_FOUND', 'Session not found');
  await prisma.session.delete({ where: { id: session.id } });
  res.status(204).send();
}));
