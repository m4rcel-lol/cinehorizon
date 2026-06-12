import { Queue } from 'bullmq';
import { redis } from '../lib/redis.js';

export interface TranscodeJobData {
  uploadJobId: string;
  videoId: string;
  inputPath: string;
  contentId?: string;
  episodeId?: string;
}

export const transcodeQueue = new Queue<TranscodeJobData>('transcode', { connection: redis });
