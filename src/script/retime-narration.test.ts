import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {ScriptSchema} from '../render/script-schema.js';
import {retimeNarration} from './retime-narration.js';
import {applySpokenGithubHook} from './github-stars.js';
const candidate=()=>{const s=ScriptSchema.parse(JSON.parse(readFileSync('tests/fixtures/studio-director.json','utf8')));s.targetDurationSec=90;return s;};
const source={title:'Repo',url:'manual',domain:'manual',ogImage:null,content:'FULL README SOURCE with usage and requirements'};
it('repairs only narration with per-scene budgets, original source and measured feedback',async()=>{
 const s=candidate();let prompt='';
 const provider={name:'fake',generate:async(_system:string,user:string)=>{prompt=user;return JSON.stringify({scenes:s.scenes.map(scene=>({id:scene.id,voiceText:scene.type==='outro'?'changed outro':'Lời đọc được sửa.'}))});}};
 const result=await retimeNarration(provider,s,source,{sceneSeconds:[4,12,15,6],gapSec:.08,holdSec:.6},'Actual speech 37 seconds; target 90 seconds');
 expect(prompt).toContain(source.content);expect(prompt).toContain('targetWords');expect(prompt).toContain('Actual speech 37 seconds');
 expect(result.scenes[1].voiceText).toContain(s.scenes[1].voiceText);expect(result.scenes[1].voiceText).toContain('Lời đọc được sửa.');expect(prompt).toContain('append');
 expect(result.scenes.at(-1)?.voiceText).toBe(s.scenes.at(-1)?.voiceText);
 expect(result.scenes.map(x=>x.templateData)).toEqual(s.scenes.map(x=>x.templateData));
 expect(s.scenes[1].voiceText).not.toBe(result.scenes[1].voiceText);
});
it('rejects missing or reordered scenes during narration-only repairs',async()=>{
 const s=candidate();
 const provider={name:'fake',generate:async()=>JSON.stringify({scenes:[{id:'wrong',voiceText:'Lời đọc'}]})};
 await expect(retimeNarration(provider,s,source,{sceneSeconds:[4,12,15,6],gapSec:.08,holdSec:.6},'Fix duration')).rejects.toThrow(/giữ nguyên id/);
});

it.each([90,120])('preserves the spoken repo identity and budgets its words when retiming to %is',async(target)=>{
 const s=candidate();s.targetDurationSec=target;s.metadata.source.url='https://github.com/owner/cleanyourtv';
 s.metadata.githubStars={repoUrl:s.metadata.source.url,count:15238,fetchedAt:'2026-10-29T00:00:00Z'};
 applySpokenGithubHook(s);const prefix=s.scenes[0].githubStarSpokenPrefix!;let prompt='';
 const provider={name:'fake',generate:async(_system:string,user:string)=>{
  prompt=user;return JSON.stringify({scenes:s.scenes.map(scene=>({id:scene.id,voiceText:'Gỡ quảng cáo không cần root.'}))});
 }};
 const result=await retimeNarration(provider,s,source,{sceneSeconds:[8,20,20,6],gapSec:.08,holdSec:.6},'Shorten the hook');
 const plan=JSON.parse(prompt.split('NGÂN SÁCH BẮT BUỘC TỪNG CẢNH (đếm tiếng theo khoảng trắng):\n')[1].split('\n\n')[0]);
 expect(plan[0].protectedPrefix).toBe(prefix);
 expect(plan[0].targetWords).toBe(Math.max(1,plan[0].targetTotalWords-prefix.split(/\s+/).length));
 expect(result.scenes[0].voiceText).toBe(prefix+' Gỡ quảng cáo không cần root.');
 applySpokenGithubHook(result);expect(result.scenes[0].voiceText.match(/cleanyourtv/g)).toHaveLength(1);
});
