import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFileAsync, resolveFfmpeg } from '../lib/ffmpeg.js';

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
