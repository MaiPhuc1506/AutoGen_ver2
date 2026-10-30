import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, rm, copyFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import type { Script } from '../render/script-schema.js';
import { estimateWordTimings } from '../captions/estimator.js';
import { parseSrt } from '../captions/srt.js';

const exec = promisify(execFile);
export const UPLOAD_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../.uploads');
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uploadPath(id: string) {
  if (!ID.test(id)) throw new Error('Mã audio không hợp lệ.');
  return join(UPLOAD_DIR, id + '.wav');
}
export async function saveUpload(bytes: Buffer, name: string) {
  if (!/\.(mp3|wav)$/i.test(name)) throw new Error('Chỉ nhận file MP3 hoặc WAV.');
  if (!bytes.length || bytes.length > 30 * 1024 * 1024) throw new Error('Audio phải có dữ liệu và không quá 30 MB.');
  await mkdir(UPLOAD_DIR, { recursive: true });
  const id = randomUUID();
  const temp = join(UPLOAD_DIR, id + '.input');
  const out = uploadPath(id);
  try {
    await writeFile(temp, bytes);
    const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', temp]);
    const probe = JSON.parse(stdout);
    const durationSec = Number(probe.format.duration);
    if (!['mp3', 'wav'].some(f => probe.format.format_name.split(',').includes(f)) || !probe.streams.some((s: any) => s.codec_type === 'audio')) throw new Error('File không phải audio MP3/WAV hợp lệ.');
    if (!Number.isFinite(durationSec) || durationSec < 1 || durationSec > 600) throw new Error('Audio cần dài từ 1 giây đến 10 phút.');
    await exec('ffmpeg', ['-v', 'error', '-y', '-i', temp, '-map', '0:a:0', '-vn', '-ar', '44100', '-ac', '1', '-c:a', 'pcm_s16le', out]);
    await writeFile(join(UPLOAD_DIR, id + '.json'), JSON.stringify({ durationSec, name: name.slice(0, 200) }));
    return { uploadId: id, durationSec, name: name.slice(0, 200), audioUrl: `/api/studio/audio/${id}` };
  } catch (err) {
    await rm(out, { force: true });
    throw err;
  } finally { await rm(temp, { force: true }); }
}
export async function readUpload(id: string) {
  const path = uploadPath(id);
  if (!existsSync(path)) throw new Error('Không tìm thấy audio. Hãy tải file lên lại.');
  const meta = JSON.parse(await readFile(join(UPLOAD_DIR, id + '.json'), 'utf8'));
  return { path, ...meta } as { path: string; durationSec: number; name: string };
}

export function importedBoundaries(script: Script, duration: number): number[] {
  const supplied = script.voice.sceneBoundaries;
  const weights = script.scenes.map(s => s.voiceText.trim().split(/\s+/).length);
  const sum = weights.reduce((a, b) => a + b, 0);
  let cursor = 0;
  const boundaries = supplied || weights.slice(0, -1).map(w => (cursor += w / sum * duration));
  if (boundaries.length !== script.scenes.length - 1 || boundaries.some((b, i) => b <= (boundaries[i - 1] ?? 0) || b >= duration)) throw new Error('Mốc cảnh phải tăng dần, nằm trong audio, đủ một mốc cho mỗi cảnh sau cảnh đầu.');
  return [0, ...boundaries, duration];
}
export function importedCues(script: Script, duration: number) {
  if (!script.voice.captionsSrt?.trim()) return undefined;
  const cues = parseSrt(script.voice.captionsSrt);
  if (!cues.length || cues.some((c, i) => c.startMs < (cues[i - 1]?.endMs ?? 0) || c.endMs <= c.startMs || c.endSec > duration + 0.05)) throw new Error('SRT cần cue không chồng lấn, có thời lượng dương và không vượt quá audio.');
  // SRT only guarantees cue-level timing, never word-level alignment.
  return cues.map(c => ({ ...c, accuracy: 'low' as const }));
}
export async function prepareImportedVoice(script: Script, outputDir: string) {
  const source = await readUpload(script.voice.uploadId!);
  const boundaries = importedBoundaries(script, source.durationSec);
  const cues = importedCues(script, source.durationSec);
  const dir = join(outputDir, 'voice');
  await mkdir(dir, { recursive: true });
  // Keep the continuous narration untouched; scene cuts are only for the editor.
  await copyFile(source.path, join(outputDir, 'imported-voice.wav'));
  const scenes = [];
  for (let i = 0; i < script.scenes.length; i++) {
    const scene = script.scenes[i];
    const durationSec = boundaries[i + 1] - boundaries[i];
    const path = join(dir, `scene-${scene.id}.mp3`);
    await exec('ffmpeg', ['-v', 'error', '-y', '-i', source.path, '-ss', String(boundaries[i]), '-t', String(durationSec), '-c:a', 'libmp3lame', '-b:a', '192k', path]);
    const words = estimateWordTimings(scene.voiceText, durationSec);
    await writeFile(join(dir, `scene-${scene.id}.words.json`), JSON.stringify(words));
    // Imported segments must never be reused as synthesized speech.
    await rm(path + '.cache.json', { force: true });
    scenes.push({ id: scene.id, path, durationSec, words, accuracy: 'low' as const });
  }
  return { scenes, cues, source };
}

/** Split narration for review, using SRT cue boundaries when available. */
export function assignImportedNarration(script: Script, content: string, duration: number) {
  const cues = importedCues(script, duration);
  const count = script.scenes.length;
  if (cues && cues.length >= count) {
    script.voice.sceneBoundaries = [];
    script.scenes.forEach((scene, i) => {
      const start = Math.floor(i * cues.length / count);
      const end = Math.floor((i + 1) * cues.length / count);
      scene.voiceText = cues.slice(start, end).map(c => c.text).join(' ');
      if (i) script.voice.sceneBoundaries!.push(cues[start].startSec);
    });
    return;
  }
  const text = cues ? cues.map(c => c.text).join(' ') : content.trim();
  const sentences = text.match(/[^.!?]+[.!?]*(?:\s+|$)/g)?.map(s => s.trim()).filter(Boolean) || [];
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < count) throw new Error('Nhập đầy đủ lời đọc khớp audio, ít nhất 5 tiếng.');
  const chunks = sentences.length >= count ? sentences : words;
  script.scenes.forEach((scene, i) => {
    scene.voiceText = chunks.slice(Math.floor(i * chunks.length / count), Math.floor((i + 1) * chunks.length / count)).join(' ');
  });
}
