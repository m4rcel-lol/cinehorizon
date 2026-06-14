import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AppError } from '../lib/errors.js';

const execFileAsync = promisify(execFile);

async function resolveFfmpeg() {
  const { stdout } = await execFileAsync('which', ['ffmpeg']);
  const ffmpegPath = stdout.trim();
  if (!ffmpegPath) throw new AppError(500, 'FFMPEG_NOT_FOUND', 'ffmpeg binary was not found');
  return ffmpegPath;
}

export async function compressImageToWebp(inputPath: string, outputPath: string) {
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  const ffmpeg = await resolveFfmpeg();
  await execFileAsync(ffmpeg, [
    '-y',
    '-i', inputPath,
    '-vf', "scale='min(1920,iw)':-2",
    '-c:v', 'libwebp',
    '-quality', '82',
    '-compression_level', '6',
    outputPath
  ], { maxBuffer: 1024 * 1024 * 2 });
}
