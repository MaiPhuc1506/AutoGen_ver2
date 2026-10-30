import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ScriptSchema, type Script } from '../render/script-schema.js';
import { voiceConfig, cachedSpeech, studioTts } from './voice.js';
import { saveUpload, readUpload, uploadPath, UPLOAD_DIR, importedBoundaries, importedCues, prepareImportedVoice, assignImportedNarration } from './uploads.js';
import { composeHtml } from '../render/html-composer.js';
const exec = promisify(execFile);
let dir: string;
let originalEnv: NodeJS.ProcessEnv;
let script: Script;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'studio-test-'));
  originalEnv = { ...process.env };
  process.env.TTS_PROVIDER = 'edge-tts';
  script = ScriptSchema.parse(JSON.parse(await readFile('tests/fixtures/studio-editorial.json', 'utf8')));
});
afterEach(async () => { process.env = originalEnv; await rm(dir, { recursive: true, force: true }); });

describe('Studio voice and imports', () => {
  it('applies voice and speed per request without mutating environment; legacy still uses env', () => {
    process.env.EDGE_TTS_VOICE = 'vi-VN-HoaiMyNeural';
    process.env.EDGE_TTS_RATE = '+5%';
    expect(voiceConfig(script.voice).edgeTtsRate).toBe('+10%');
    expect(voiceConfig(script.voice).edgeTtsVoice).toBe('vi-VN-NamMinhNeural');
    expect(process.env.EDGE_TTS_RATE).toBe('+5%');
    delete script.voice.settingsSource;
    expect(voiceConfig(script.voice).edgeTtsRate).toBe('+5%');
  });
  it('selects paid provider credentials independently from default provider', () => {
    process.env.ELEVENLABS_API_KEY = 'test-key';
    delete process.env.ELEVENLABS_VOICE_ID;
    const cfg = voiceConfig({ ...script.voice, provider: 'elevenlabs', voiceId: 'chosen' });
    expect(cfg.elevenlabsVoiceId).toBe('chosen');
    expect(cfg.elevenlabsModelId).toBe('eleven_flash_v2_5');
    expect(cfg.ttsProvider).toBe('elevenlabs');
    delete process.env.ELEVENLABS_API_KEY;
    expect(() => voiceConfig({ ...script.voice, provider: 'elevenlabs', voiceId: 'chosen' })).toThrow(/ELEVENLABS_API_KEY/);
  });
  it('regenerates cache after text/speed/voice changes and preserves low timing accuracy', async () => {
    const sample = join(dir, 'sample.wav');
    await exec('ffmpeg', ['-v','error','-y','-f','lavfi','-i','sine=frequency=440:duration=1',sample]);
    const client = { generate: vi.fn(async (_text: string, out: string) => { await writeFile(out, await readFile(sample)); return { accuracy: 'low' as const, words: [{text:'test',startMs:0,endMs:1000}] }; }) };
    const cfg = voiceConfig(script.voice);
    const out = join(dir, 'scene.mp3');
    await cachedSpeech('Xin chào', out, cfg, 1, client);
    expect((await cachedSpeech('Xin chào', out, cfg, 1, client)).accuracy).toBe('low');
    expect(client.generate).toHaveBeenCalledTimes(1);
    await cachedSpeech('Đổi nội dung', out, cfg, 1, client);
    await cachedSpeech('Đổi nội dung', out, cfg, 1.2, client);
    await cachedSpeech('Đổi nội dung', out, { ...cfg, edgeTtsVoice:'vi-VN-HoaiMyNeural' }, 1.2, client);
    expect(client.generate).toHaveBeenCalledTimes(4);
    expect(Array.isArray(JSON.parse(await readFile(out.replace('.mp3','.words.json'),'utf8')))).toBe(true);
    expect(await readFile(out+'.cache.json','utf8')).not.toContain('apiKey');
  });
  it('uses dictionary only for TTS and keeps canonical subtitle spelling even when provider returns phonetics',async()=>{
    const sample=join(dir,'canonical.wav');await exec('ffmpeg',['-v','error','-y','-f','lavfi','-i','sine=frequency=400:duration=0.4',sample]);
    let spoken='';const client={generate:async(text:string,out:string)=>{spoken=text;await writeFile(out,await readFile(sample));return {accuracy:'high' as const,words:[{text:'đép bít ba sáu',startMs:0,endMs:400}]};}};
    const result=await cachedSpeech('DevPeek36',join(dir,'canonical.mp3'),voiceConfig(script.voice),1,client,'lexicon');
    expect(spoken).toBe('đép bít ba sáu');expect(result.accuracy).toBe('high');expect(result.words[0].startMs).toBe(0);expect(result.words[0].endMs).toBe(400);expect(result.words.map(w=>w.text).join(' ')).toBe('DevPeek36');
  });
  it('validates uploaded audio bytes, keeps full narration, and uses explicit scene boundaries', async () => {
    const file = join(dir,'source.wav');
    await exec('ffmpeg', ['-v','error','-y','-f','lavfi','-i','sine=frequency=550:duration=5',file]);
    const upload = await saveUpload(await readFile(file),'voice.wav');
    try {
      expect(upload.durationSec).toBeCloseTo(5,1);
      expect((await readUpload(upload.uploadId)).path).toBe(uploadPath(upload.uploadId));
      script.voice.uploadId = upload.uploadId;
      script.voice.sceneBoundaries = [1,2,3,4];
      const imported = await prepareImportedVoice(script,dir);
      expect(imported.scenes.map(s=>s.durationSec)).toEqual([1,1,1,1,1]);
      expect(await readFile(join(dir,'imported-voice.wav'))).toEqual(await readFile(uploadPath(upload.uploadId)));
      expect(imported.scenes.every(s=>s.accuracy==='low')).toBe(true);
    } finally {
      await rm(uploadPath(upload.uploadId),{force:true});
      await rm(join(UPLOAD_DIR,upload.uploadId+'.json'),{force:true});
    }
    await expect(saveUpload(Buffer.from('not audio'),'bad.mp3')).rejects.toThrow();
    await expect(saveUpload(Buffer.from('not audio'),'bad.exe')).rejects.toThrow(/MP3/);
    expect(()=>uploadPath('../config/llm')).toThrow();
  });
  it('rejects misordered boundaries and SRT outside audio; never marks cue-derived words high', () => {
    script.voice.sceneBoundaries = [1,3,2,4];
    expect(()=>importedBoundaries(script,5)).toThrow(/Mốc cảnh/);
    script.voice.captionsSrt = '1\n00:00:00,000 --> 00:00:01,000\nXin chào\n';
    expect(importedCues(script,5)?.[0].accuracy).toBe('low');
    expect(()=>importedCues(script,.5)).toThrow(/SRT/);
  });
  it('uses real SRT cue boundaries for imported scene text instead of splitting Vietnamese phrases', () => {
    script.voice.captionsSrt = Array.from({length: 5}, (_, i) => `${i+1}\n00:00:0${i},000 --> 00:00:0${i+1},000\nCâu thứ ${i+1}.`).join('\n\n');
    assignImportedNarration(script, 'Ignored placeholder', 5);
    expect(script.scenes.map(s=>s.voiceText)).toEqual(['Câu thứ 1.','Câu thứ 2.','Câu thứ 3.','Câu thứ 4.','Câu thứ 5.']);
    expect(script.voice.sceneBoundaries).toEqual([1,2,3,4]);
    delete script.voice.captionsSrt;
    assignImportedNarration(script, 'Một câu rõ ràng. Hai câu tiếp theo. Ba ý chính. Bốn lần kiểm tra. Năm cảnh hoàn chỉnh.', 5);
    expect(script.scenes[0].voiceText).toBe('Một câu rõ ràng.');
  });
  it('renders editorial captions using local runtime while v1 fixture keeps existing look', async () => {
    const args = { script, sceneAudio:script.scenes.map(s=>({id:s.id,durationSec:2})),gapSec:0,bgImageRelPath:null,audioRelPath:'voice.mp3' };
    const html = composeHtml(args);
    expect(html).toContain('<body class="tech-editorial">');
    expect(html).toContain('src="gsap.min.js"');
    expect(html).not.toContain('fonts.googleapis.com');
    const legacy = ScriptSchema.parse(JSON.parse(await readFile('tests/fixtures/sample-script-no-image.json','utf8')));
    expect(composeHtml({...args,script:legacy,sceneAudio:legacy.scenes.map(s=>({id:s.id,durationSec:2}))})).toContain('<body>');
    expect(ScriptSchema.safeParse({...script,scenes:script.scenes.map((s,i)=>i===0?{...s,id:'../escape'}:s)}).success).toBe(false);
  });
});
it('invalidates cached speech when smart normalization or its explicit term override changes, retaining original caption text',async()=>{
 const cfg=voiceConfig(script.voice);const out=join(dir,'smart.mp3');const source=join(dir,'test-tone.mp3');
 await exec('ffmpeg',['-v','error','-y','-f','lavfi','-i','sine=frequency=440:duration=1','-c:a','libmp3lame',source]);
 const inputs:string[]=[];const client={async generate(text:string,file:string){inputs.push(text);const {copyFile}=await import('node:fs/promises');await copyFile(source,file);return {accuracy:'high' as const,words:[{text,startMs:0,endMs:1000}]};}};
 const original='API giảm 12,5%.';
 await cachedSpeech(original,out,cfg,1.1,client,'original');
 const a=await cachedSpeech(original,out,cfg,1.1,client,'smart');
 await cachedSpeech(original,out,cfg,1.1,client,'smart');expect(inputs).toHaveLength(2);
 expect(inputs[1]).toContain('mười hai phẩy năm phần trăm');expect(a.accuracy).toBe('low');expect(a.words.map(w=>w.text).join(' ')).toBe(original);
 await cachedSpeech(original,out,cfg,1.1,client,'smart',{API:'ê pi ai riêng'});expect(inputs).toHaveLength(3);expect(inputs[2]).toContain('ê pi ai riêng');
});
