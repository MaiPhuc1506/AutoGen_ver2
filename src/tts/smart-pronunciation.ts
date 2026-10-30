import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {loadLexicon,speechText,pronunciationReport,type LexiconMap} from './lexicon.js';
import {englishNameReading} from './english-name.js';
export type PronunciationMode='original'|'lexicon'|'smart';
export const SMART_SPEECH_REVISION='zerotts-0.1.5-smart-v2-names';
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
/** A bounded stdlib subprocess, injectable for tests. Never starts the voice model. */
export async function normalizeWithZeroRules(text:string):Promise<string>{
 return new Promise((resolve,reject)=>{
  const child=spawn('python3',[join(process.cwd(),'scripts/normalize-speech.py')],{stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
  let output='';const timeout=setTimeout(()=>{child.kill();reject(Error('Chuẩn hóa phát âm quá thời gian.'));},10000);
  child.stdout.on('data',c=>{output+=c.toString();if(output.length>1000000){child.kill();reject(Error('Văn bản chuẩn hóa quá dài.'));}});
  child.stderr.on('data',()=>{});
  child.on('error',()=>{clearTimeout(timeout);reject(Error('Không chạy được bộ chuẩn hóa tiếng Việt. Cần Python 3.'));});
  child.on('close',code=>{clearTimeout(timeout);try{if(code!==0)throw Error();const data=JSON.parse(output);if(typeof data.text!=='string')throw Error();resolve(data.text);}catch{reject(Error('Bộ chuẩn hóa tiếng Việt không xử lý được văn bản.'));}});
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({text}));
 });
}
const EXTRA_TERMS:LexiconMap={GSAP:'gi ét ây pi',TTS:'ti ti ét',CPU:'xi pi diu',GPU:'gi pi diu',RAM:'ram',CSS:'xi ét ét',HTML:'âych ti em eo'};
export async function prepareSpeechText(text:string,mode?:PronunciationMode,overrides?:LexiconMap,normalize:(s:string)=>Promise<string>=normalizeWithZeroRules):Promise<string>{
 if(mode!=='smart')return speechText(text,mode,overrides);
 const dict={...EXTRA_TERMS,...loadLexicon(),...overrides};
 const lookup=new Map(Object.entries(dict).map(([k,v])=>[k.toLowerCase(),v]));
 const keys=Object.keys(dict).sort((a,b)=>b.length-a.length).map(escape);
 // Links/code are literal; protected dictionary readings cannot be re-expanded.
 const protectedPattern=new RegExp('https?:\\/\\/[^\\s<>]+|[\\w.+-]+@[\\w.-]+\\.[A-Za-z]{2,}|`[^`]+`|(?<![\\p{L}\\p{N}_])(?:'+keys.join('|')+'|[A-Za-z](?:[A-Za-z._-]*[A-Za-z])?)(?![\\p{L}\\p{N}_])','giu');
 let prefix='https://speech.invalid/keep';while(text.includes(prefix))prefix+='x';
 const saved:string[]=[];const hold=(value:string)=>{const id=saved.push(value)-1;return `${prefix}${id}end`;};
 // Mark explicit version contexts before numbers are expanded as decimals.
 let prepared=text.normalize('NFC').replace(/((?:phiên bản|version|Node\.js|Python|pnpm|npm)\s+)(v?\d+(?:\.\d+){1,3}(?:\.[xX])?)/giu,(_m,prefix,version)=>prefix+hold(speechText(version,'lexicon')));
 prepared=prepared.replace(protectedPattern,m=>{
  if(m.startsWith(prefix))return m;
  if(/^https?:\/\/|^[\w.+-]+@|^`/.test(m))return hold(m);
  const reading=lookup.get(m.toLowerCase())||englishNameReading(m,dict);
  return reading?hold(reading):m;
 });
 const units:Record<string,string>={GB:'gi ga bai',MB:'mê ga bai',TB:'tê ra bai',KB:'ki lô bai',GHz:'gi ga héc',MHz:'mê ga héc',FPS:'khung hình mỗi giây',ms:'mi li giây',px:'điểm ảnh',USD:'đô la Mỹ',VND:'đồng'};
 prepared=prepared.replace(/(\d[\d.,]*)\s*(GHz|MHz|GB|MB|TB|KB|FPS|ms|px|USD|VND)(?![\p{L}\p{N}_])/gu,(_m,n,u)=>n+' '+units[u]);
 prepared=prepared.replace(/(\d[\d.,]*)\s*[₫đ](?!\p{L})/gu,'$1 đồng').replace(/(\d[\d.,]*)K(?=\s+(?:sao|stars|lượt|người))/giu,'$1 nghìn').replace(/(\d)\s*[×x]\s*(?=\d)/gu,'$1 nhân ');
 prepared=prepared.replace(/(?<![\p{L}\p{N}_.])(\d+)\.(\d{1,2})(?![\d.])/gu,'$1,$2');
 // Zero rules disambiguate dates/times/decimals; legacy fallback handles unknown acronyms.
 const normalized=await normalize(prepared);
 const spoken=speechText(normalized,'lexicon');
 return spoken.replace(new RegExp(escape(prefix)+'(\\d+)end','g'),(_m,id)=>saved[Number(id)]??_m);
}
export async function preparedPronunciationReport(text:string,mode?:PronunciationMode,overrides?:LexiconMap){
 const base=pronunciationReport(text,mode==='smart'?'lexicon':mode,mode==='smart'?{...EXTRA_TERMS,...loadLexicon(),...overrides}:overrides);
 return {...base,spoken:await prepareSpeechText(text,mode,overrides),normalizer:mode==='smart'?SMART_SPEECH_REVISION:mode||'lexicon'};
}
