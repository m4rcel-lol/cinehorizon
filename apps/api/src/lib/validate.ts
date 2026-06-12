import type { Request } from 'express';
import type { ZodTypeAny, z } from 'zod';

export function parseBody<TSchema extends ZodTypeAny>(req: Request, schema: TSchema): z.infer<TSchema> {
  return schema.parse(req.body);
}

export function parseQuery<TSchema extends ZodTypeAny>(req: Request, schema: TSchema): z.infer<TSchema> {
  return schema.parse(req.query);
}
