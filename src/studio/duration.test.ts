import {it,expect} from 'vitest';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {durationPlan,fitVoiceDuration} from './duration.js';
import {ScriptSchema} from '../render/script-schema.js';
import {getDurationSec} from '../assets/audio-tools.js';
import {speechText,applyLexicon,validateLexicon,resetLexiconCache} from '../tts/lexicon.js';
const exec=promisify(execFile);
it('calculates target including scene gaps/hold and refuses extreme stretching or cutting',()=>{
 const p=durationPlan([10,20,25],60,.08,.6);expect(p.durations.reduce((a,b)=>a+b,0)+.24+.6).toBeCloseTo(60,8);
 expect(()=>durationPlan([2,3],60,.08,.6)).toThrow(/bổ sung/);expect(()=>durationPlan([100,120],60,.08,.6)).toThrow(/rút gọn/);
});
it('fits measured audio files without modifying original cache, keeps original captions and counts exact timeline',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'director-duration-'));
 try{
  const source=join(dir,'raw.wav');await exec('ffmpeg',['-v','error','-y','-f','lavfi','-i','sine=frequency=330:duration=1',source]);
  const original=await readFile(source);const script=ScriptSchema.parse(JSON.parse(await readFile('tests/fixtures/studio-dynamic.json','utf8')));script.targetDurationSec=30;
  const voices=script.scenes.map(s=>({id:s.id,path:source,durationSec:1,words:[],accuracy:'low' as const}));
  script.targetDurationSec=5;
  const result=await fitVoiceDuration(script,voices,dir,.08,.6);
  const total=(await Promise.all(result.voices.map(a=>getDurationSec(a.path)))).reduce((a,b)=>a+b,0)+1;
  expect(total).toBeCloseTo(5,3);
  const timed=await fitVoiceDuration(script,voices.map(v=>({...v,accuracy:'high' as const,words:[{text:'Xin',startMs:200,endMs:600}]})),dir,.08,.6);
  expect(timed.voices[0].accuracy).toBe('high');expect(timed.voices[0].words[0].startMs).toBe(Math.round(200/timed.tempo));expect(timed.voices[0].words[0].endMs).toBe(Math.round(600/timed.tempo));expect(await readFile(source)).toEqual(original);expect(result.voices[0].words.map(w=>w.text).join(' ')).toBe(script.scenes[0].voiceText);
 }finally{await rm(dir,{recursive:true,force:true});}
});
it('keeps technical spelling in source but reads channel through dictionary; handles Unicode boundaries and validates entries',()=>{
 resetLexiconCache();expect(speechText('Theo dõi DevPeek36.','lexicon')).toBe('Theo dõi đép bít ba sáu.');expect(speechText('DevPeek36 API','original')).toBe('DevPeek36 API');
 expect(applyLexicon('cáiAI AI_foo API Node.js',{'AI':'ây ai','API':'ây pi ai','Node.js':'nốt'})).toBe('cáiAI AI_foo ây pi ai nốt');
 expect(()=>validateLexicon({AI:{bad:true}})).toThrow();expect(()=>validateLexicon(['bad'])).toThrow();
});
it('invalidates voice cache fingerprint when per-video pronunciation changes',async()=>{
 const {speechFingerprint,voiceConfig}=await import('./voice.js');
 const script=ScriptSchema.parse(JSON.parse(await readFile('tests/fixtures/studio-director.json','utf8')));
 const cfg=voiceConfig(script.voice);
 const first=speechFingerprint('Agent',cfg,1,'lexicon',{Agent:'ây chình'});
 expect(speechFingerprint('Agent',cfg,1,'lexicon',{Agent:'ây chình'})).toBe(first);
 expect(speechFingerprint('Agent',cfg,1,'lexicon',{Agent:'ây giần'})).not.toBe(first);
});
