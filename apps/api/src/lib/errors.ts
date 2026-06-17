import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

export class AppError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const notFound = (_req: Request, _res: Response, next: NextFunction) => {
  next(new AppError(404, 'NOT_FOUND', 'Route not found'));
};

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    return res.status(400).json({ error: error.issues[0]?.message ?? 'Validation failed', code: 'VALIDATION_ERROR', statusCode: 400 });
  }
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({ error: error.message, code: error.code, statusCode: error.statusCode });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = error.meta?.target;
    const fields = Array.isArray(target) ? target.join(', ') : 'value';
    return res.status(409).json({ error: `A record with this ${fields} already exists`, code: 'CONFLICT', statusCode: 409 });
  }
  console.error(error);
  return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_SERVER_ERROR', statusCode: 500 });
}
