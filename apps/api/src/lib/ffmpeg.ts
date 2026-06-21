import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AppError } from './errors.js';

export const execFileAsync = promisify(execFile);

let cachedFfmpegPath: string | undefined;

/**
 * Resolve the ffmpeg binary path once and memoize it. Shared by the transcode
 * worker and the image-compression service so the `which ffmpeg` lookup only
 * runs a single time per process.
 */
export async function resolveFfmpeg() {
  if (cachedFfmpegPath) return cachedFfmpegPath;
  const { stdout } = await execFileAsync('which', ['ffmpeg']);
  const ffmpegPath = stdout.trim();
  if (!ffmpegPath) throw new AppError(500, 'FFMPEG_NOT_FOUND', 'ffmpeg binary was not found');
  cachedFfmpegPath = ffmpegPath;
  return ffmpegPath;
}
