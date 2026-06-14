import { env, isProduction } from '../config/env.js';
import type { Request } from 'express';

function toOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/+$/, '');
  }
}

function localhostAliases(origin: string) {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return [];
  }
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return [];
  return ['localhost', '127.0.0.1', '[::1]'].map((host) => `${url.protocol}//${host}${url.port ? `:${url.port}` : ''}`);
}

function isLoopbackOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

function requestOrigin(req: Request) {
  const forwardedHost = req.header('x-forwarded-host');
  const host = forwardedHost || req.header('host');
  if (!host) return null;
  const forwardedProto = req.header('x-forwarded-proto');
  const proto = forwardedProto || req.protocol;
  return `${proto}://${host}`;
}

export function configuredOrigins() {
  const origins = [
    env.BASE_URL,
    env.WEB_ORIGIN,
    env.ADMIN_ORIGIN,
    env.MEDIA_PUBLIC_URL,
    ...env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
  ].map(toOrigin);

  const allowed = new Set<string>();
  for (const origin of origins) {
    allowed.add(origin);
    if (!isProduction) {
      for (const alias of localhostAliases(origin)) allowed.add(alias);
    }
  }
  return allowed;
}

export function isOriginAllowed(origin: string, req?: Request) {
  const normalizedOrigin = toOrigin(origin);
  if (!isProduction && isLoopbackOrigin(normalizedOrigin)) return true;
  if (configuredOrigins().has(normalizedOrigin)) return true;
  if (!req) return false;
  const currentRequestOrigin = requestOrigin(req);
  return currentRequestOrigin ? normalizedOrigin === toOrigin(currentRequestOrigin) : false;
}
