import fs from 'node:fs/promises';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env.js';

const hasS3 = Boolean(env.S3_BUCKET && env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY);

const s3 = hasS3 ? new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT || undefined,
  forcePathStyle: Boolean(env.S3_ENDPOINT),
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY!
  }
}) : null;

export function isExternalUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

export async function putObject(key: string, localFilePath: string, contentType: string) {
  if (s3 && env.S3_BUCKET) {
    await s3.send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: createReadStream(localFilePath), ContentType: contentType }));
    return `${env.CDN_URL.replace(/\/$/, '')}/${key}`;
  }
  const target = path.join(env.LOCAL_MEDIA_DIR, key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(localFilePath, target);
  return `${env.CDN_URL.replace(/\/$/, '')}/${key}`;
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
    const contentType = key.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : key.endsWith('.ts') ? 'video/mp2t' : 'application/octet-stream';
    await putObject(key, file, contentType);
  }
  return `${env.CDN_URL.replace(/\/$/, '')}/${keyPrefix}/master.m3u8`;
}

export async function signPlaybackUrl(urlOrKey: string, expiresInSeconds = 14_400) {
  if (isExternalUrl(urlOrKey)) return urlOrKey;
  if (s3 && env.S3_BUCKET) {
    const command = new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: urlOrKey });
    return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
  }
  return `${env.CDN_URL.replace(/\/$/, '')}/${urlOrKey}`;
}

export async function deleteObjectByKey(key: string) {
  if (s3 && env.S3_BUCKET) {
    await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    return;
  }
  await fs.rm(path.join(env.LOCAL_MEDIA_DIR, key), { recursive: true, force: true });
}
