import type {TtsTimingResult,WordTiming} from '../tts/tts-client.js';
const norm=(s:string)=>s.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const same=(a:string,b:string)=>Boolean(norm(a))&&norm(a)===norm(b)&&(!/^[A-Z][A-Z0-9._-]+$/.test(a.replace(/[^\p{L}\p{N}_.-]/gu,''))||a===b);
/** Anchor unchanged words to provider times; map expanded names/numbers back to their display tokens. */
export function alignSpokenWords(original:string,timing:TtsTimingResult):TtsTimingResult{
 const tokens=original.trim().split(/\s+/),spoken=timing.words;
 if(!tokens.length||!spoken.length)return {accuracy:'low',words:[]};
 const rows=Array.from({length:tokens.length+1},()=>new Uint16Array(spoken.length+1));
 for(let i=tokens.length-1;i>=0;i--)for(let j=spoken.length-1;j>=0;j--)rows[i][j]=same(tokens[i],spoken[j].text)?1+rows[i+1][j+1]:Math.max(rows[i+1][j],rows[i][j+1]);
 const anchors:[number,number][]=[[-1,-1]];let i=0,j=0;
 while(i<tokens.length&&j<spoken.length){if(same(tokens[i],spoken[j].text)){anchors.push([i++,j++]);}else if(rows[i+1][j]>=rows[i][j+1])i++;else j++;}
 anchors.push([tokens.length,spoken.length]);const words:WordTiming[]=[];let exact=timing.accuracy==='high';
 for(let a=1;a<anchors.length;a++){
  const [pi,pj]=anchors[a-1],[ni,nj]=anchors[a];const count=ni-pi-1,span=nj-pj-1;
  if(count){
   const start=span?spoken[pj+1].startMs:pj>=0?spoken[pj].endMs:0;
   const end=span?spoken[nj-1].endMs:nj<spoken.length?spoken[nj].startMs:start;
   if(count>1||!span)exact=false;
   for(let k=0;k<count;k++)words.push({text:tokens[pi+1+k],startMs:Math.round(start+(end-start)*k/count),endMs:Math.round(start+(end-start)*(k+1)/count)});
  }
  if(ni<tokens.length)words.push({...spoken[nj],text:tokens[ni]});
 }
 return {accuracy:exact?'high':'low',words};
}
