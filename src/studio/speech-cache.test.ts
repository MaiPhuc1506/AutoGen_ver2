import {it,expect,vi} from 'vitest';
import {mkdtemp,readFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {cachedSpeech,voiceConfig} from './voice.js';
it('shares one synthesis across draft and render directories, retaining real word timestamps',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'speech-cache-'));
 vi.stubEnv('TTS_CACHE_DIR',join(dir,'shared'));
 try{
  const sample=join(dir,'sample.wav');await promisify(execFile)('ffmpeg',['-v','error','-y','-f','lavfi','-i','sine=duration=0.4',sample]);
  const client={generate:vi.fn(async(_text:string,out:string)=>{await (await import('node:fs/promises')).writeFile(out,await readFile(sample));return {accuracy:'high' as const,words:[{text:'Chào',startMs:100,endMs:350}]};})};
  const cfg=voiceConfig({provider:'edge-tts',voiceId:'vi-VN-NamMinhNeural',speed:1.2,settingsSource:'script'});
  const [draft,render]=await Promise.all([cachedSpeech('Chào',join(dir,'draft','voice.mp3'),cfg,1.2,client,'original'),cachedSpeech('Chào',join(dir,'render','voice.mp3'),cfg,1.2,client,'original')]);
  expect(client.generate).toHaveBeenCalledTimes(1);expect(draft.words).toEqual(render.words);expect(render.words[0].startMs).toBe(100);expect(render.accuracy).toBe('high');
  expect(await readFile(draft.path)).toEqual(await readFile(render.path));
  await cachedSpeech('Chào',join(dir,'third','voice.mp3'),cfg,1.2,client,'original');expect(client.generate).toHaveBeenCalledTimes(1);
 }finally{vi.unstubAllEnvs();await rm(dir,{recursive:true,force:true});}
});
