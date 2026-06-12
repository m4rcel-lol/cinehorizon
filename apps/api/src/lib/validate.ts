import type { Request } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { AppError } from './errors.js';

export function parseBody<TSchema extends ZodTypeAny>(req: Request, schema: TSchema): z.infer<TSchema> {
  return schema.parse(req.body);
}

export function parseQuery<TSchema extends ZodTypeAny>(req: Request, schema: TSchema): z.infer<TSchema> {
  return schema.parse(req.query);
}

export function requireParam(req: Request, name: string): string {
  const value = req.params[name];
  if (!value) throw new AppError(400, 'MISSING_ROUTE_PARAM', `Missing route parameter: ${name}`);
  return value;
}

export function requireIntParam(req: Request, name: string): number {
  const raw = requireParam(req, name);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new AppError(400, 'BAD_ROUTE_PARAM', `Route parameter must be a positive integer: ${name}`);
  return value;
}

export function requireActiveProfileId(req: Request): string {
  if (!req.activeProfileId) throw new AppError(400, 'PROFILE_REQUIRED', 'x-profile-id header is required');
  return req.activeProfileId;
}
