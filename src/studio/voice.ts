import {join,dirname} from 'node:path';
import {alignSpokenWords} from '../captions/spoken-alignment.js';
import {prepareSpeechText,SMART_SPEECH_REVISION,type PronunciationMode} from '../tts/smart-pronunciation.js';
import {ZERO_VOICES,ZEROTTS_REVISION} from '../tts/zerotts-settings.js';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, rm, rename, mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { Script } from '../render/script-schema.js';
import { loadConfig, type Config, type TtsProvider } from '../config.js';
import { createTtsClient, type TtsClient, type TtsTimingResult } from '../tts/tts-client.js';
import { getDurationSec } from '../assets/audio-tools.js';
import { speechText, type LexiconMap } from '../tts/lexicon.js';
import { estimateWordTimings } from '../captions/estimator.js';
import { parseSrt, generateSrt } from '../captions/srt.js';

const exec = promisify(execFile);
export const PROVIDERS = ['edge-tts', 'vbee', 'elevenlabs', 'lucylab', 'zerotts'] as const;

/** Explicit opt-in preserves environment-based behaviour for legacy scripts. */
export function voiceConfig(voice: Script['voice']): Config {
  if (voice.uploadId) return loadConfig({ provider: 'edge-tts' });
  if (voice.settingsSource !== 'script') return loadConfig();
  if (!PROVIDERS.includes(voice.provider as TtsProvider)) throw new Error('Nhà cung cấp giọng không hợp lệ.');
  const cfg = loadConfig({ provider: voice.provider as TtsProvider, voiceId: voice.voiceId });
  if(cfg.ttsProvider==='zerotts'){if(!ZERO_VOICES.some(v=>v.id===voice.voiceId))throw new Error('Chọn giọng ZeroTTS hợp lệ.');cfg.zeroTtsVoice=voice.voiceId;}
  if (cfg.ttsProvider === 'edge-tts') {
    if (!['vi-VN-NamMinhNeural', 'vi-VN-HoaiMyNeural'].includes(voice.voiceId)) throw new Error('Chọn giọng Edge tiếng Việt hợp lệ.');
    cfg.edgeTtsVoice = voice.voiceId;
    const rate = Math.round((voice.speed - 1) * 100);
    cfg.edgeTtsRate = `${rate >= 0 ? '+' : ''}${rate}%`;
  }
  if (cfg.ttsProvider === 'vbee') {
    if (voice.speed > 1.9) throw new Error('Vbee hỗ trợ tốc độ tối đa 1,9x.');
    cfg.vbeeVoiceCode = voice.voiceId;
    cfg.vbeeSpeedRate = voice.speed;
  }
  if (cfg.ttsProvider === 'elevenlabs') {
    cfg.elevenlabsVoiceId = voice.voiceId;
    cfg.elevenlabsModelId = process.env.ELEVENLABS_MODEL_ID && process.env.ELEVENLABS_MODEL_ID !== 'eleven_multilingual_v2' ? process.env.ELEVENLABS_MODEL_ID : 'eleven_flash_v2_5';
  }
  if (cfg.ttsProvider === 'lucylab') cfg.lucylabVoiceId = voice.voiceId;
  return cfg;
}

/** Native speed on Edge/Vbee; pitch-preserving tempo for other providers. */
export function studioTts(cfg: Config, voice: Script['voice']): TtsClient {
  const client = createTtsClient(cfg);
  const tempo = voice.settingsSource === 'script' && ['elevenlabs', 'lucylab', 'zerotts'].includes(cfg.ttsProvider) ? voice.speed : 1;
  if (tempo === 1) return client;
  return { async generate(text, out, srt) {
    const raw = out + '.tempo-source.mp3';
    try {
      const timing = await client.generate(text, raw, srt);
      await exec('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-af', `atempo=${tempo}`, '-c:a', 'libmp3lame', '-b:a', '192k', out]);
      if (srt && existsSync(srt)) {
        const cues = parseSrt(await readFile(srt, 'utf8')).map(c => ({ ...c,
          startMs: Math.round(c.startMs / tempo), endMs: Math.round(c.endMs / tempo),
          startSec: c.startSec / tempo, endSec: c.endSec / tempo }));
        await writeFile(srt, generateSrt(cues));
      }
      return timing ? { ...timing, words: timing.words.map(w => ({ ...w, startMs: Math.round(w.startMs / tempo), endMs: Math.round(w.endMs / tempo) })) } : timing;
    } finally { await rm(raw, { force: true }); }
  } };
}

export function speechFingerprint(text: string, cfg: Config, speed: number, pronunciation?: PronunciationMode, overrides?: LexiconMap, prepared?:string): string {
  // Credentials never enter persisted cache metadata.
  const settings = { timingRevision:cfg.ttsProvider==='edge-tts'?'word-boundary-v2':undefined,displayText:cfg.ttsProvider==='edge-tts'?text:undefined, provider: cfg.ttsProvider, zero: [cfg.zeroTtsVoice,ZEROTTS_REVISION], speed, edge: [cfg.edgeTtsVoice, cfg.edgeTtsRate, cfg.edgeTtsPitch, cfg.edgeTtsVolume],
    eleven: [cfg.elevenlabsVoiceId, cfg.elevenlabsModelId, cfg.elevenlabsEndpoint],
    vbee: [cfg.vbeeVoiceCode, cfg.vbeeSpeedRate, cfg.vbeeEndpoint], lucy: [cfg.lucylabVoiceId, cfg.lucylabEndpoint] };
  return createHash('sha256').update(JSON.stringify({ text: prepared??speechText(text, pronunciation==='smart'?'lexicon':pronunciation, overrides), normalizer:pronunciation==='smart'?SMART_SPEECH_REVISION:undefined, settings })).digest('hex');
}

async function cachedSpeechLocal(text: string, out: string, cfg: Config, speed: number, client: TtsClient, pronunciation?: PronunciationMode, overrides?: LexiconMap) {
  const srt = out.replace(/\.mp3$/, '.srt');
  const wordsFile = out.replace(/\.mp3$/, '.words.json');
  const metaFile = out + '.cache.json';
  const spoken=await prepareSpeechText(text,pronunciation,overrides);
  const fingerprint = speechFingerprint(text, cfg, speed, pronunciation, overrides,spoken);
  let timing: TtsTimingResult | undefined;
  try {
    const meta = JSON.parse(await readFile(metaFile, 'utf8'));
    if (meta.fingerprint === fingerprint && existsSync(out)) {
      const words = JSON.parse(await readFile(wordsFile, 'utf8'));
      if (Array.isArray(words)) timing = { words, accuracy: meta.accuracy === 'high' ? 'high' : 'low' };
    }
  } catch { /* Legacy or stale cache: regenerate once. */ }
  if (!timing) {
    await Promise.all([rm(srt, { force: true }), rm(wordsFile, { force: true }), rm(metaFile, { force: true })]);
    const temp = out + '.pending.mp3';
    try {
      const generated = await client.generate(spoken, temp, srt);
      const duration = await getDurationSec(temp);
      timing = generated && generated.words.length ? (spoken===text?generated:alignSpokenWords(text,generated)) : { accuracy: 'low', words: estimateWordTimings(text, duration) };
      await rename(temp, out);
      await writeFile(wordsFile, JSON.stringify(timing.words));
      await writeFile(metaFile, JSON.stringify({ fingerprint, accuracy: timing.accuracy }));
    } finally { await rm(temp, { force: true }); }
  }
  return { path: out, durationSec: await getDurationSec(out), ...timing };
}

const speechInFlight=new Map<string,Promise<Awaited<ReturnType<typeof cachedSpeechLocal>>>>();
/** Content-addressed audio survives the draft → render output-directory change. */
export async function cachedSpeech(text:string,out:string,cfg:Config,speed:number,client:TtsClient,pronunciation?:PronunciationMode,overrides?:LexiconMap){
 if(process.env.VITEST&&!process.env.TTS_CACHE_DIR)return cachedSpeechLocal(text,out,cfg,speed,client,pronunciation,overrides);
 const spoken=await prepareSpeechText(text,pronunciation,overrides);
 const fingerprint=speechFingerprint(text,cfg,speed,pronunciation,overrides,spoken);
 // Existing local caches remain usable for legacy providers.
 try{const meta=JSON.parse(await readFile(out+'.cache.json','utf8'));if(meta.fingerprint===fingerprint&&existsSync(out))return await cachedSpeechLocal(text,out,cfg,speed,client,pronunciation,overrides);}catch{}
 const dir=process.env.TTS_CACHE_DIR||join(process.cwd(),'.cache','speech');await mkdir(dir,{recursive:true});
 const cacheKey=createHash('sha256').update(fingerprint+'\0'+text).digest('hex');
 const shared=join(dir,cacheKey+'.mp3');
 let pending=speechInFlight.get(cacheKey);
 if(!pending){pending=cachedSpeechLocal(text,shared,cfg,speed,client,pronunciation,overrides);speechInFlight.set(cacheKey,pending);}
 try{
  const result=await pending;await mkdir(dirname(out),{recursive:true});
  for(const suffix of ['', '.cache.json'])await copyFile(shared+suffix,out+suffix);
  await copyFile(shared.replace(/\.mp3$/,'.words.json'),out.replace(/\.mp3$/,'.words.json'));
  try{await copyFile(shared.replace(/\.mp3$/,'.srt'),out.replace(/\.mp3$/,'.srt'));}catch{}
  return {...result,path:out};
 }finally{if(speechInFlight.get(cacheKey)===pending)speechInFlight.delete(cacheKey);}
}
