import type {Script} from '../render/script-schema.js';
const key=(s:string)=>s.normalize('NFC').toLocaleLowerCase('vi').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const sentences=(s:string)=>Array.from(new Intl.Segmenter('vi',{granularity:'sentence'}).segment(s),x=>x.segment.trim()).filter(Boolean);
/** Collapse adjacent phrases, but preserve Vietnamese reduplication such as “từ từ”. */
function collapsePhrases(text:string):string{
 const words=text.split(/\s+/);
 for(let i=0;i<words.length;i++){
  for(let n=Math.min(12,Math.floor((words.length-i)/2));n>=2;n--){
   const first=words.slice(i,i+n).map(key),second=words.slice(i+n,i+2*n).map(key);
   if(first.every(Boolean)&&new Set(first).size>1&&first.every((w,j)=>w===second[j])){
    // Keep punctuation on the last occurrence.
    words.splice(i,n);i--;break;
   }
  }
 }
 return words.join(' ');
}
/** Remove repeated sentences and an adjacent scene's repeated opening, without adding filler. */
export function cleanNarration(text:string,previous=''):string{
 const seen=new Set<string>();const prior=sentences(previous).map(key);
 const parts=sentences(text);const counts=new Map<string,number>();
 for(const part of parts)counts.set(key(part),(counts.get(key(part))??0)+1);
 const result:string[]=[];
 for(const part of parts){
  const sentence=collapsePhrases(part);
  const k=key(sentence);if(!k||seen.has(k))continue;
  // Repeated short labels appended after an explanation are padding, not narration.
  if((counts.get(key(part))??0)>1&&k.split(' ').length<=5&&result.some(s=>key(s).split(' ').length>=10))continue;
  if(!result.length&&prior.includes(k))continue;
  seen.add(k);result.push(sentence);
 }
 let cleaned=result.join(' ');
 if(previous&&cleaned){
  const before=previous.trim().split(/\s+/),after=cleaned.split(/\s+/);
  for(let n=Math.min(before.length,after.length);n>=4;n--)if(key(before.slice(-n).join(' '))===key(after.slice(0,n).join(' '))){cleaned=after.slice(n).join(' ');break;}
 }
 return cleaned.trim();
}
export function cleanScriptNarration(script:Script):void{
 let previous='';for(const scene of script.scenes){
  const cleaned=cleanNarration(scene.voiceText,previous);
  if(!cleaned)throw new Error(`${scene.id}: toàn bộ lời đọc lặp cảnh trước; viết một ý mới từ nguồn hoặc gộp cảnh.`);
  scene.voiceText=cleaned;previous=scene.voiceText;
 }
}

/** Reject repeated sentences across distant scenes rather than silently emptying a scene. */
export function validateNarrationRepetition(script:Script):void{
 const seen=new Map<string,string>();
 for(const scene of script.scenes){
  if(cleanNarration(scene.voiceText)!==scene.voiceText.trim())throw new Error(`${scene.id}: lời đọc lặp câu hoặc cụm từ; bỏ phần lặp trước khi đo thời lượng.`);
  for(const sentence of sentences(scene.voiceText)){
   const k=key(sentence);if(k.split(' ').length<2)continue;
   const previous=seen.get(k);
   if(previous)throw new Error(`${scene.id}: lặp lại câu đã đọc ở ${previous}: “${sentence}”. Bổ sung chi tiết mới từ nguồn, không nhắc lại để đủ giây.`);
   seen.set(k,scene.id);
  }
 }
}

export function appendUniqueNarration(original:string,addition:string):string{
 const existing=new Set(sentences(original).map(key));
 return cleanNarration(original+' '+sentences(addition).filter(s=>!existing.has(key(s))).join(' '));
}
