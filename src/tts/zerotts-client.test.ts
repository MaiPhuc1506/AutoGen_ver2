import {it,expect,beforeAll,afterAll} from 'vitest';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import nock from 'nock';
import {ZeroTtsClient} from './zerotts-client.js';
import {ZERO_VOICES,ZEROTTS_REVISION} from './zerotts-settings.js';
import {voiceConfig,speechFingerprint} from '../studio/voice.js';
import {getDurationSec} from '../assets/audio-tools.js';
const exec=promisify(execFile);let dir:string,wav:Buffer;
beforeAll(async()=>{dir=await mkdtemp(join(tmpdir(),'zero-client-'));const path=join(dir,'sample.wav');await exec('ffmpeg',['-v','error','-y','-f','lavfi','-i','sine=frequency=440:duration=0.4',path]);wav=await readFile(path);});
afterAll(async()=>{nock.cleanAll();await rm(dir,{recursive:true,force:true});});
it('encodes authenticated local WAV to pipeline MP3 without downloading/running a real model',async()=>{
 const server=nock('http://127.0.0.1:17821').post('/synthesize',{text:'âu bình đi zai và ây chình',voice:'quangminh'}).matchHeader('Authorization','Bearer local-test-token').reply(200,wav,{'Content-Type':'audio/wav'});
 const client=new ZeroTtsClient({voice:'quangminh',connect:async()=>({url:'http://127.0.0.1:17821',token:'local-test-token'})});
 const out=join(dir,'out.mp3');await client.generate('âu bình đi zai và ây chình',out);expect(await getDurationSec(out)).toBeGreaterThan(.35);expect(server.isDone()).toBe(true);
});
it('validates text/voices and fails explicitly instead of silently using another voice',async()=>{
 await expect(new ZeroTtsClient({voice:'not-a-voice'}).generate('Hi',join(dir,'bad.mp3'))).rejects.toThrow(/giọng/);
 const client=new ZeroTtsClient({voice:'quangminh',connect:async()=>({url:'http://127.0.0.1:17821',token:'secret-token'})});
 await expect(client.generate('',join(dir,'bad.mp3'))).rejects.toThrow(/ký tự/);
 nock('http://127.0.0.1:17821').post('/synthesize').reply(500,{error:'secret-token'});
 await expect(client.generate('Hi',join(dir,'bad.mp3'))).rejects.toThrow('ZeroTTS local không tạo được audio (HTTP 500)');
 nock('http://127.0.0.1:17821').post('/synthesize').reply(200,Buffer.from('NOT AUDIO'));
 await expect(client.generate('Hi',join(dir,'bad.mp3'))).rejects.toThrow(/không hợp lệ/);
});
it('supports every bundled voice without API keys and fingerprints voice/model identity',async()=>{
 const voice={provider:'zerotts',voiceId:'quangminh',speed:1.1,settingsSource:'script' as const};
 for(const v of ZERO_VOICES)expect(voiceConfig({...voice,voiceId:v.id}).zeroTtsVoice).toBe(v.id);
 const a=voiceConfig(voice),b=voiceConfig({...voice,voiceId:'maichi'});
 expect(speechFingerprint('Xin chào',a,1.1)).not.toBe(speechFingerprint('Xin chào',b,1.1));
 const worker=await readFile('scripts/zerotts_worker.py','utf8');expect(worker).toContain(ZEROTTS_REVISION);expect(worker).toContain("('127.0.0.1', args.port)");
});
