import { Queue } from 'bullmq';
import { redis } from '../lib/redis.js';
export const transcodeQueue = new Queue('transcode', { connection: redis });
//# sourceMappingURL=transcodeQueue.js.map