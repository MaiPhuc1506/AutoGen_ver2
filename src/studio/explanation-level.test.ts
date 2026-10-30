import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {ScriptSchema} from '../render/script-schema.js';
import {explanationDuration} from './explanation-level.js';
import {assessNarration} from './narration-timing.js';
const make=()=>ScriptSchema.parse(JSON.parse(readFileSync('tests/fixtures/studio-director.json','utf8')));
it('keeps natural durations and clamps only at the selected boundary',()=>{
 expect(explanationDuration('quick',48.3)).toBe(48.3);expect(explanationDuration('quick',64)).toBe(60);
 expect(explanationDuration('standard',74.95)).toBe(74.95);expect(explanationDuration('standard',61)).toBe(61);
 expect(explanationDuration('standard',60)).toBeGreaterThan(60);expect(explanationDuration('standard',95)).toBe(90);
 expect(explanationDuration('detailed',90)).toBe(90);expect(explanationDuration('detailed',113.4)).toBe(113.4);expect(explanationDuration('detailed',125)).toBe(120);
 expect(()=>explanationDuration('quick',NaN)).toThrow();
});
it.each([['quick',45],['quick',59.9],['standard',73.63],['standard',89.7],['detailed',90],['detailed',111.8]] as const)('accepts %s narration of %ss without forcing a preset or stretching speech', (level,total)=>{
 const s=make();s.explanationLevel=level;s.targetDurationSec=90;
 const overhead=.08*s.scenes.length+.6;
 const report=assessNarration(s,{sceneSeconds:s.scenes.map((_,i)=>i===0?4:(total-overhead-4)/(s.scenes.length-1)),gapSec:.08,holdSec:.6});
 expect(report.accepted).toBe(true);expect(report.targetSec).toBeCloseTo(total,6);expect(report.tempo).toBeCloseTo(1,8);
});
it('rejects large mismatches and long hooks instead of bypassing duration checks',()=>{
 const s=make();s.explanationLevel='detailed';
 let report=assessNarration(s,{sceneSeconds:[4,20,20,6],gapSec:.08,holdSec:.6});expect(report.accepted).toBe(false);expect(report.feedback).toContain('BỔ SUNG');
 s.explanationLevel='standard';report=assessNarration(s,{sceneSeconds:[9,25,35,6],gapSec:.08,holdSec:.6});expect(report.accepted).toBe(false);
});
it('stores fractional measured durations only in range mode, retaining old JSON validation',()=>{
 const s=make();s.targetDurationSec=74.95;expect(ScriptSchema.safeParse(s).success).toBe(false);
 s.explanationLevel='standard';expect(ScriptSchema.safeParse(s).success).toBe(true);
 s.targetDurationSec=18.2;s.explanationLevel='quick';expect(ScriptSchema.safeParse(s).success).toBe(true);
});
