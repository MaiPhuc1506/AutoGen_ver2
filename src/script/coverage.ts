import type {Script} from '../render/script-schema.js';
export const COVERAGE_TOPICS=['purpose','features','usage','requirements','limitations','examples'] as const;
const norm=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
/** Verify references and quoted evidence, not every semantic claim in the generated narration. */
export function validateCoverage(script:Script,source:string):void {
 if(!script.coverage)throw new Error('Thiếu coverage: cần đối chiếu purpose, features, usage, requirements, limitations, examples.');
 const keys=script.coverage.items.map(i=>i.topic);
 if(new Set(keys).size!==6||COVERAGE_TOPICS.some(k=>!keys.includes(k)))throw new Error('coverage phải đủ đúng sáu khía cạnh, không lặp.');
 const ids=new Set(script.scenes.map(s=>s.id));
 for(const item of script.coverage.items){
  if(item.sceneIds.some(id=>!ids.has(id)))throw new Error(`coverage ${item.topic} trỏ đến cảnh không tồn tại.`);
  if(item.status==='covered'){
   if(!item.sceneIds.length)throw new Error(`coverage ${item.topic} cần sceneIds.`);
   if(!item.evidence?.trim()||!norm(source).includes(norm(item.evidence)))throw new Error(`coverage ${item.topic}: evidence phải là trích đoạn NGUYÊN VĂN có trong nguồn.`);
  }
 }
}

/** Invalid AI annotations are visibly flagged, never presented as verified coverage. */
export function reviewCoverage(script:Script,source:string):void {
 if(!script.coverage)return;
 const ids=new Set(script.scenes.map(s=>s.id));const warnings:string[]=[];
 for(const item of script.coverage.items){
  const invalid=item.sceneIds.some(id=>!ids.has(id));
  item.sceneIds=item.sceneIds.filter(id=>ids.has(id));
  if(item.status!=='covered'){if(item.status!=='needs-review')item.sceneIds=[];continue;}
  if(invalid||!item.sceneIds.length||!item.evidence?.trim()||!norm(source).includes(norm(item.evidence))){
   item.status='needs-review';warnings.push(`${item.topic}: cần duyệt lại trích đoạn nguồn hoặc liên kết cảnh do AI đề xuất.`);
  }
 }
 script.coverage.warnings=warnings;
}
