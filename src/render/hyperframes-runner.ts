import { spawn, execFile } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { readFile, rename, rm } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import {imageSize} from '../media/image-size.js';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { log } from '../utils/logger.js';

export interface RenderArgs {
  compositionDir: string;
  outputPath: string;
  fps?: number;
  quality?: 'draft' | 'standard' | 'high';
  workers?:1|2|4;
}

/** Do not report a successful MP4 when a required image is missing or invalid. */
export async function validateCompositionImages(dir:string,html:string):Promise<void>{
 const sources=[...new Set([...html.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(m=>m[1].replace(/&amp;/g,'&')))];
 for(const src of sources){
  if(/^[a-z]+:/i.test(src)||src.startsWith('/'))throw new Error(`Ảnh chưa được lưu vào bản dựng: ${src}`);
  const path=resolve(dir,src),rel=relative(resolve(dir),path);
  if(rel.startsWith('..')||isAbsolute(rel)||!existsSync(path))throw new Error(`Thiếu ảnh trong bản dựng: ${src}`);
  try{await imageSize(path);}catch{throw new Error(`Ảnh bị lỗi hoặc không đọc được: ${src}`);}
 }
}

export async function verifyRenderedVideo(path: string, expectedDuration?: number): Promise<void> {
  const { stdout } = await promisify(execFile)('ffprobe', ['-v','error','-show_streams','-show_format','-of','json',path]);
  const probe = JSON.parse(stdout);
  const video = probe.streams.find((s: any) => s.codec_type === 'video');
  const audio = probe.streams.some((s: any) => s.codec_type === 'audio');
  const duration = Number(probe.format.duration);
  if (!video || video.width !== 1080 || video.height !== 1920 || !audio || !Number.isFinite(duration) || duration <= 0) {
    throw new Error('Video xuất chưa hợp lệ: cần 1080×1920 và có audio.');
  }
  if (expectedDuration && Math.abs(duration - expectedDuration) > 0.15) throw new Error(`Video chưa đủ thời lượng: ${duration}s / ${expectedDuration}s.`);
}

export async function renderWithHyperframes(args: RenderArgs): Promise<void> {
  const { compositionDir, outputPath, fps = 30, quality = 'standard',workers=2 } = args;
  const html = await readFile(join(compositionDir, 'index.html'), 'utf8');
  await validateCompositionImages(compositionDir,html);
  const expectedDuration = Number(html.match(/id="stage"[\s\S]*?data-duration="([\d.]+)"/)?.[1]) || undefined;
  // Never let an existing MP4 satisfy the completion watchdog for a new run.
  const temporaryOutput = resolve(outputPath.replace(/\.mp4$/i, '') + `.${randomUUID()}.rendering.mp4`);
  const spawnArgs = ['hyperframes','render',compositionDir,'--output',temporaryOutput,'--fps',String(fps),'--quality',quality,'--workers',String(workers)];
  try {
    await new Promise<void>((resolveRender, reject) => {
      const isWin = process.platform === 'win32';
      let settled = false;
      let finishing = false;
      let closing = false;
      let lastSize = -1;
      let stableCount = 0;
      const proc = spawn(isWin ? 'npx.cmd' : 'npx', spawnArgs, {
        stdio:['ignore','pipe','pipe'], shell:isWin,
        env:{...process.env,HYPERFRAMES_NO_TELEMETRY:'1',DO_NOT_TRACK:'1'},
      });
      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        clearInterval(watchdog);
        reject(err);
      };
      const complete = async (stopCli: boolean, strict: boolean) => {
        if (settled || finishing) return;
        finishing = true;
        try {
          await verifyRenderedVideo(temporaryOutput, expectedDuration);
          await rename(temporaryOutput, resolve(outputPath));
          settled = true;
          clearInterval(watchdog);
          if (stopCli) { try { proc.kill('SIGTERM'); } catch {} }
          resolveRender();
        } catch (err: any) {
          finishing = false;
          if (strict || closing) fail(err);
        }
      };
      // Keep the existing CLI-hang workaround, but only for a complete fresh file.
      const watchdog = setInterval(() => {
        if (settled || !existsSync(temporaryOutput)) return;
        const size = statSync(temporaryOutput).size;
        if (size > 1000 && size === lastSize) stableCount++; else stableCount = 0;
        lastSize = size;
        if (stableCount >= 2) void complete(true, false);
      }, 2000);
      const handleOutput = (chunk: Buffer) => {
        process.stdout.write(chunk);
        const text = chunk.toString();
        if (text.includes('Render complete') || text.includes('Rendered in')) void complete(true, false);
      };
      proc.stdout?.on('data', handleOutput);
      proc.stderr?.on('data', handleOutput);
      proc.on('close', code => {
        closing = true;
        if (settled) return;
        if (code === 0) void complete(false, true);
        else fail(new Error(`hyperframes render failed with exit code ${code}`));
      });
      proc.on('error', fail);
    });
  } finally { await rm(temporaryOutput, { force: true }); }
  log.info(`Rendered and verified: ${outputPath}`);
}
