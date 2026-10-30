import {z} from 'zod';
export const ExplanationLevelSchema=z.enum(['quick','standard','detailed']);
export type ExplanationLevel=z.infer<typeof ExplanationLevelSchema>;
export const EXPLANATION_LEVELS={
 quick:{label:'Giải thích nhanh',minSec:0,maxSec:60,preferredSec:45,description:'Tối đa 60 giây'},
 standard:{label:'Giải thích vừa',minSec:60,maxSec:90,preferredSec:75,description:'Trên 60 đến 90 giây'},
 detailed:{label:'Giải thích kỹ',minSec:90,maxSec:120,preferredSec:105,description:'Từ 90 đến 120 giây'},
} as const;
/** Clamp only at a tier boundary; a natural duration inside the tier stays unchanged. */
export function explanationDuration(level:ExplanationLevel,naturalSec:number,fps=24):number{
 if(!Number.isFinite(naturalSec)||naturalSec<=0)throw Error('Không đo được thời lượng tự nhiên.');
 const range=EXPLANATION_LEVELS[level];
 const lower=level==='standard'?range.minSec+1/fps:range.minSec;
 return Math.max(lower,Math.min(range.maxSec,naturalSec));
}
