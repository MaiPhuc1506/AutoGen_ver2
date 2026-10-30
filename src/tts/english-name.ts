import type {LexiconMap} from './lexicon.js';

// Approximate English sounds for Vietnamese voices; whole-name overrides win.
const ROOTS:LexiconMap={
 clean:'cờ lin',your:'do',tv:'ti vi',auto:'o tô',video:'vi đi ô',gen:'gen',
 code:'câu đờ',flow:'phlâu',chat:'chát',voice:'voi sờ',speech:'xờ pích',
 text:'téc xờ t',zero:'di rô',web:'uép',browser:'brao dờ',tool:'tun',tools:'tun sờ',
 cloud:'clao',data:'đây ta',fast:'phát',light:'lai t',kit:'kít',
 frame:'phờ rêm',frames:'phờ rêm sờ',my:'mai',live:'lai vờ',
};

/** Only fully understood compounds are split; unknown brands stay intact for AI/overrides. */
export function englishNameReading(name:string,lexicon:LexiconMap):string|undefined{
 if(name.length>100||! /^[A-Za-z][A-Za-z._-]*$/.test(name))return;
 const dictionary=new Map(Object.entries({...ROOTS,...lexicon}).filter(([term])=>/^[a-z]{2,}$/i.test(term)).map(([term,reading])=>[term.toLowerCase(),reading]));
 const chunks=name.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/([A-Z])([A-Z][a-z])/g,'$1 $2').split(/[\s._-]+/).filter(Boolean);
 const segment=(word:string):string[]|undefined=>{
  const memo=new Map<number,string[]|undefined>();
  const visit=(start:number):string[]|undefined=>{
   if(start===word.length)return [];
   if(memo.has(start))return memo.get(start);
   // Longest known word first, with backtracking for a complete match.
   for(let end=word.length;end>=start+2;end--){
    const part=word.slice(start,end).toLowerCase();if(!dictionary.has(part))continue;
    const rest=visit(end);if(rest){const result=[part,...rest];memo.set(start,result);return result;}
   }
   memo.set(start,undefined);return;
  };
  return visit(0);
 };
 const parts:string[]=[];
 for(const chunk of chunks){const words=segment(chunk);if(!words)return;parts.push(...words);}
 if(parts.length<2)return;
 return parts.map(part=>dictionary.get(part)).join(' ');
}
