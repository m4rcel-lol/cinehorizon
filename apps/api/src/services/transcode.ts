import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../lib/errors.js';

const execFileAsync = promisify(execFile);

export async function resolveFfmpeg() {
  const { stdout } = await execFileAsync('which', ['ffmpeg']);
  const ffmpegPath = stdout.trim();
  if (!ffmpegPath) throw new AppError(500, 'FFMPEG_NOT_FOUND', 'ffmpeg binary was not found');
  return ffmpegPath;
}

export function buildFfmpegArgs(input: string, outputDir: string) {
  return [
    '-y', '-i', input,
    '-filter_complex', '[0:v]split=3[v1][v2][v3];[v1]scale=w=854:h=480[v480];[v2]scale=w=1280:h=720[v720];[v3]scale=w=1920:h=1080[v1080]',
    '-map', '[v480]', '-map', '0:a:0?', '-c:v:0', 'libx264', '-crf:v:0', '28', '-preset', 'medium', '-b:v:0', '550k', '-maxrate:v:0', '650k', '-bufsize:v:0', '900k', '-c:a:0', 'aac', '-b:a:0', '64k',
    '-map', '[v720]', '-map', '0:a:0?', '-c:v:1', 'libx264', '-crf:v:1', '26', '-preset', 'medium', '-b:v:1', '1400k', '-maxrate:v:1', '1700k', '-bufsize:v:1', '2400k', '-c:a:1', 'aac', '-b:a:1', '96k',
    '-map', '[v1080]', '-map', '0:a:0?', '-c:v:2', 'libx264', '-crf:v:2', '24', '-preset', 'medium', '-b:v:2', '2800k', '-maxrate:v:2', '3300k', '-bufsize:v:2', '4600k', '-c:a:2', 'aac', '-b:a:2', '128k',
    '-g', '48', '-sc_threshold', '0',
    '-var_stream_map', 'v:0,a:0,name:480 v:1,a:1,name:720 v:2,a:2,name:1080',
    '-master_pl_name', 'master.m3u8',
    '-f', 'hls', '-hls_time', '6', '-hls_list_size', '0', '-hls_playlist_type', 'vod', '-hls_flags', 'independent_segments',
    '-hls_segment_filename', path.join(outputDir, 'stream_%v_%03d.ts'),
    path.join(outputDir, 'stream_%v.m3u8')
  ];
}

export async function transcodeToHls(input: string, outputDir: string) {
  await fs.mkdir(outputDir, { recursive: true });
  const ffmpeg = await resolveFfmpeg();
  const args = buildFfmpegArgs(input, outputDir);
  await execFileAsync(ffmpeg, args, { maxBuffer: 1024 * 1024 * 20 });
  return path.join(outputDir, 'master.m3u8');
}
