import 'dotenv/config';
import { z } from 'zod';

// Treat empty-string env vars (common in .env templates) as "unset" so that
// optional enums/booleans fall back to their defaults instead of failing.
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_PRIVATE_KEY_PATH: z.string().default('./keys/private.pem'),
  JWT_PUBLIC_KEY_PATH: z.string().default('./keys/public.pem'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().default(30),
  BASE_URL: z.string().default('http://localhost:47304'),
  WEB_ORIGIN: z.string().default('http://localhost:47304'),
  ADMIN_ORIGIN: z.string().default('http://localhost:47304/admin'),
  CORS_ORIGINS: z.string().default(''),
  COOKIE_DOMAIN: z.string().optional(),
  MEDIA_PUBLIC_URL: z.string().default('http://localhost:47304/media'),
  LOCAL_MEDIA_DIR: z.string().default('./media'),
  APP_NAME: z.string().default('CineHorizon'),
  // Email: 'smtp' uses the SMTP_* settings (works with Amazon SES, Postmark,
  // Mailgun, Gmail, …); 'console' logs the message instead of sending it.
  // Defaults to smtp when SMTP_HOST is set, otherwise console.
  EMAIL_TRANSPORT: z.preprocess(emptyToUndefined, z.enum(['smtp', 'console']).optional()),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_SECURE: z.preprocess(emptyToUndefined, z.coerce.boolean().optional()),
  EMAIL_FROM: z.string().default('CineHorizon <noreply@cinehorizon.local>')
});

export const env = envSchema.parse(process.env);
export const isProduction = env.NODE_ENV === 'production';
