import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {ScriptSchema} from '../render/script-schema.js';
import {assessNarration} from './narration-timing.js';
const script=()=>ScriptSchema.parse(JSON.parse(readFileSync('tests/fixtures/studio-editorial.json','utf8')));
it.each([90,120,180])('checks real narration against %is including gaps and outro hold',target=>{
 const s=script();s.targetDurationSec=target;
 const available=target-.08*s.scenes.length-.6;
 const rest=(available-4)/(s.scenes.length-1);
 const report=assessNarration(s,{sceneSeconds:s.scenes.map((_,i)=>i===0?4:rest),gapSec:.08,holdSec:.6});
 expect(report.accepted).toBe(true);expect(report.tempo).toBeCloseTo(1);expect(report.hookSec).toBeCloseTo(4);
});
it('rejects an overlong hook even when total duration is exact',()=>{
 const s=script();s.targetDurationSec=90;
 const available=90-.08*s.scenes.length-.6;
 const r=assessNarration(s,{sceneSeconds:s.scenes.map((_,i)=>i===0?15:(available-15)/(s.scenes.length-1)),gapSec:.08,holdSec:.6});
 expect(r.accepted).toBe(false);expect(r.feedback).toContain('chuyển giải thích sang body');
});
it('rejects missing or invalid measurements instead of reporting a successful fit',()=>{
 const s=script();s.targetDurationSec=90;
 expect(()=>assessNarration(s,{sceneSeconds:[NaN],gapSec:.08,holdSec:.6})).toThrow();
});
