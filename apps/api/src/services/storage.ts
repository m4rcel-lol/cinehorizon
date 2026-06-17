import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';

export function isExternalUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

function normalizeStorageKey(key: string) {
  const normalized = path.posix.normalize(key).replace(/^\/+/, '');
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    throw new AppError(400, 'BAD_STORAGE_KEY', 'Storage key must stay within local media storage');
  }
  return normalized;
}

function toLocalPath(key: string) {
  return path.join(env.LOCAL_MEDIA_DIR, ...normalizeStorageKey(key).split('/'));
}

export function resolveLocalPath(key: string) {
  return toLocalPath(key);
}

function toPublicUrl(key: string) {
  return `${env.MEDIA_PUBLIC_URL.replace(/\/$/, '')}/${normalizeStorageKey(key)}`;
}

// Strip scheme://host from URLs that point at our /media mount so assets load
// from whatever host:port the client is actually using (server IP, localhost,
// a domain, ...) instead of a baked-in MEDIA_PUBLIC_URL like localhost:47304.
// External URLs (e.g. TMDB posters) and already-relative paths pass through.
export function toRelativeMediaUrl<T extends string | null | undefined>(url: T): T {
  if (typeof url !== 'string') return url;
  return url.replace(/^https?:\/\/[^/]+(?=\/media\/)/i, '') as T;
}

export async function putObject(key: string, localFilePath: string) {
  const target = toLocalPath(key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(localFilePath, target);
  return toPublicUrl(key);
}

export async function putDirectory(localDir: string, keyPrefix: string) {
  const files: string[] = [];
  async function walk(dir: string) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else files.push(full);
    }
  }
  await walk(localDir);
  for (const file of files) {
    const relative = path.relative(localDir, file).replace(/\\/g, '/');
    const key = `${keyPrefix}/${relative}`;
    await putObject(key, file);
  }
  return toPublicUrl(`${keyPrefix}/master.m3u8`);
}

export async function resolvePlaybackUrl(urlOrKey: string) {
  const url = isExternalUrl(urlOrKey) ? urlOrKey : toPublicUrl(urlOrKey);
  return toRelativeMediaUrl(url);
}

export async function deleteObjectByKey(key: string) {
  await fs.rm(toLocalPath(key), { recursive: true, force: true });
}
