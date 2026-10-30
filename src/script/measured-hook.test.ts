import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {ScriptSchema} from '../render/script-schema.js';
import {applySpokenGithubHook} from './github-stars.js';
import {measureWithShortHook} from './measured-hook.js';
const make=()=>{const s=ScriptSchema.parse(JSON.parse(readFileSync('tests/fixtures/studio-director.json','utf8')));s.explanationLevel='standard';s.metadata.source.url='https://github.com/owner/rea';s.metadata.githubStars={repoUrl:s.metadata.source.url,count:407000,fetchedAt:'2026-10-30T00:00:00Z'};s.scenes[0].voiceText='Phân tích phần mềm với agent và bằng chứng.';applySpokenGithubHook(s);return s;};
it('shortens the identity and moves the full benefit to the body without losing or repeating it',async()=>{
 const s=make(),benefit='Phân tích phần mềm với agent và bằng chứng.',body=s.scenes[1].voiceText;let calls=0;
 const measure=async()=>{calls++;return {sceneSeconds:[s.scenes[0].githubHookStyle==='identity-only'?4:s.scenes[0].githubHookStyle==='compact'?7:9,22,25,6],gapSec:.08,holdSec:.6};};
 const report=await measureWithShortHook(s,'unused',measure);
 expect(calls).toBe(3);expect(report.sceneSeconds[0]).toBe(4);
 expect(s.scenes[0].voiceText).toBe('rea, 407 nghìn sao GitHub.');expect(s.scenes[0].voiceText).toBe(s.scenes[0].githubStarSpokenPrefix);
 expect(s.scenes[1].voiceText).toBe(benefit+' '+body);
 const text=s.scenes.map(x=>x.voiceText);await measureWithShortHook(s,'unused',measure);applySpokenGithubHook(s);expect(s.scenes.map(x=>x.voiceText)).toEqual(text);
});
it('keeps a hook already within budget and never alters uploaded narration or legacy behavior',async()=>{
 const s=make(),before=structuredClone(s);let calls=0;
 const measure=async()=>{calls++;return {sceneSeconds:[4,20,25,6],gapSec:.08,holdSec:.6};};
 await measureWithShortHook(s,'unused',measure);expect(s).toEqual(before);expect(calls).toBe(1);
 delete s.explanationLevel;const old=s.scenes[0].voiceText;
 await measureWithShortHook(s,'unused',async()=>({sceneSeconds:[12,20,25,6],gapSec:.08,holdSec:.6}));expect(s.scenes[0].voiceText).toBe(old);
});

it('classifies audio failures separately and does not retry script generation',async()=>{
 const {measureDraftAudio,NarrationAudioError}=await import('./measured-hook.js');
 let calls=0;await expect(measureDraftAudio(make(),'unused',async()=>{calls++;throw Error('EdgeTTS synthesize timeout');})).rejects.toBeInstanceOf(NarrationAudioError);expect(calls).toBe(1);
 await expect(measureDraftAudio(make(),'unused',async()=>{throw Error('Disk full');})).rejects.toThrow('Disk full');
});
