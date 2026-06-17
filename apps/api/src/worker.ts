import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs/promises';
import { Worker } from 'bullmq';
import { redis } from './lib/redis.js';
import { prisma } from './lib/prisma.js';
import { env } from './config/env.js';
import { transcodeToHls } from './services/transcode.js';
import { putDirectory } from './services/storage.js';
import type { TranscodeJobData } from './queues/transcodeQueue.js';

const worker = new Worker<TranscodeJobData>('transcode', async (job) => {
  const { uploadJobId, videoId, inputPath, contentId, episodeId } = job.data;
  await prisma.uploadJob.update({ where: { id: uploadJobId }, data: { status: 'PROCESSING', progress: 5, message: 'Queued' } });
  await prisma.video.update({ where: { id: videoId }, data: { status: 'PROCESSING' } });

  const outDir = path.join(env.LOCAL_MEDIA_DIR, 'tmp', uploadJobId, 'hls');
  try {
    await prisma.uploadJob.update({ where: { id: uploadJobId }, data: { progress: 20, message: 'Compressing to HLS 480p/720p/1080p' } });
    await transcodeToHls(inputPath, outDir);

    await prisma.uploadJob.update({ where: { id: uploadJobId }, data: { progress: 85, message: 'Saving compressed HLS locally' } });
    const keyPrefix = `videos/${contentId ?? 'episode'}/${episodeId ?? 'movie'}/${videoId}/hls`;
    const masterUrl = await putDirectory(outDir, keyPrefix);

    await prisma.video.update({ where: { id: videoId }, data: { status: 'READY', url: masterUrl, storageKey: `${keyPrefix}/master.m3u8`, mimeType: 'application/vnd.apple.mpegurl' } });
    await prisma.uploadJob.update({ where: { id: uploadJobId }, data: { status: 'READY', progress: 100, message: 'Ready' } });
    // The content/episode is created as PROCESSING while its video transcodes;
    // now that the video is READY, publish it so it appears on the site.
    if (contentId) {
      await prisma.content.updateMany({ where: { id: contentId, status: 'PROCESSING' }, data: { status: 'PUBLISHED' } });
    }
  } finally {
    await Promise.all([
      fs.rm(path.dirname(outDir), { recursive: true, force: true }),
      fs.rm(inputPath, { force: true })
    ]);
  }
}, { connection: redis });

worker.on('failed', async (job, error) => {
  if (!job) return;
  const data = job.data as TranscodeJobData;
  await prisma.uploadJob.update({ where: { id: data.uploadJobId }, data: { status: 'FAILED', error: error.message, message: 'Failed' } }).catch(() => undefined);
  await prisma.video.update({ where: { id: data.videoId }, data: { status: 'FAILED' } }).catch(() => undefined);
  await fs.rm(data.inputPath, { force: true }).catch(() => undefined);
});

// Heal content left stuck in PROCESSING by earlier runs that finished
// transcoding before the auto-publish step existed.
async function publishStuckContent() {
  const { count } = await prisma.content.updateMany({
    where: { status: 'PROCESSING', videos: { some: { status: 'READY' } } },
    data: { status: 'PUBLISHED' }
  });
  if (count > 0) console.log(`Published ${count} content item(s) that had finished processing`);
}

publishStuckContent().catch((error) => console.error('Failed to reconcile stuck content', error));

console.log('CineHorizon transcode worker started');
