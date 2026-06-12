import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_PRIVATE_KEY_PATH: z.string().default('./keys/private.pem'),
  JWT_PUBLIC_KEY_PATH: z.string().default('./keys/public.pem'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().default(30),
  BASE_URL: z.string().default('http://localhost'),
  WEB_ORIGIN: z.string().default('http://localhost'),
  ADMIN_ORIGIN: z.string().default('http://localhost/admin'),
  COOKIE_DOMAIN: z.string().optional(),
  MEDIA_PUBLIC_URL: z.string().default('http://localhost/media'),
  LOCAL_MEDIA_DIR: z.string().default('./media')
});

export const env = envSchema.parse(process.env);
export const isProduction = env.NODE_ENV === 'production';
