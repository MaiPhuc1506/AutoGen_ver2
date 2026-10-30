// Original instrumental bed: 80 BPM, 8 bars, no sampled music or vocals.
// Rebuild with: node scripts/create-soft-tech-bgm.mjs
import {writeFileSync,unlinkSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const rate=44100,beat=.75,duration=32*beat,n=Math.round(rate*duration);
const left=new Float32Array(n),right=new Float32Array(n);
const hz=midi=>440*2**((midi-69)/12);
let seed=36;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
function note(start,len,midi,gain,kind='pad',pan=0){
 const offset=Math.round(start*rate),count=Math.min(Math.round(len*rate),n-offset),f=hz(midi);
 for(let i=0;i<count;i++){
  const t=i/rate,phase=2*Math.PI*f*t;
  const env=kind==='pad'?Math.min(1,t/.4)*Math.min(1,(len-t)/.75):Math.min(1,t/.008)*Math.exp(-t/(kind==='bass'?.22:.18))*Math.min(1,(len-t)/.04);
  const tone=Math.sin(phase)+(kind==='pad'?.13:kind==='bass'?.08:.23)*Math.sin(2*phase)+.035*Math.sin(3*phase);
  const value=tone*env*gain;left[offset+i]+=value*(1-pan*.35);right[offset+i]+=value*(1+pan*.35);
 }
}
// Dm9 – Bbmaj7 – Fmaj7 – Cadd9. Low mids stay sparse for narration.
const chords=[[62,65,69,72,76],[58,62,65,69,72],[60,64,65,69,72],[60,64,67,72,74]];
const roots=[38,34,41,36];
for(let c=0;c<4;c++){
 const start=c*8*beat;
 chords[c].forEach((m,j)=>note(start,8*beat,m,.027,'pad',(j-2)/2));
 for(let b=0;b<8;b++){
  if(b%2===0)note(start+b*beat,beat*.85,roots[c],.09,'bass');
  const m=chords[c][[0,2,4,2,1,3,4,2][b]]+12;
  note(start+(b+.5)*beat,beat*.62,m,.026,'pluck',b%2?.6:-.6);
 }
}
for(let b=0;b<32;b++){
 const start=Math.round(b*beat*rate);
 if(b%4===0||b%4===2)for(let i=0;i<rate*.12&&start+i<n;i++){
  const t=i/rate,v=.08*Math.exp(-t*45)*Math.sin(2*Math.PI*(48*t+3*(1-Math.exp(-t*25))));left[start+i]+=v;right[start+i]+=v;
 }
 // Quiet brushed ticks on the offbeat, softened by the final low-pass.
 const off=Math.round((b+.5)*beat*rate);for(let i=0;i<rate*.04&&off+i<n;i++){
  const v=(random()*2-1)*.012*Math.exp(-i/(rate*.008));left[off+i]+=v;right[off+i]+=v;
 }
}
const wav=Buffer.alloc(44+n*4);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(2,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*4,28);wav.writeUInt16LE(4,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(n*4,40);
for(let i=0;i<n;i++){const fade=Math.min(1,i/(rate*.012),(n-1-i)/(rate*.04));for(const [ch,a] of [[0,left],[1,right]])wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,a[i]*fade))*32767),44+i*4+ch*2);}
const out=join(root,'assets/bgm');mkdirSync(out,{recursive:true});const temp=join(out,'.soft-tech-source.wav');writeFileSync(temp,wav);
try{execFileSync('ffmpeg',['-v','error','-y','-i',temp,'-af','highpass=f=55,lowpass=f=6200,loudnorm=I=-20:TP=-3:LRA=6','-ar','44100','-c:a','libmp3lame','-b:a','192k','-metadata','title=DevPeek36 Soft Tech','-metadata','artist=DevPeek36 procedural instrumental','-metadata','comment=Original synthesis; CC0; no third-party samples',join(out,'devpeek36-soft-tech.mp3')]);}finally{unlinkSync(temp);}
console.log('Created assets/bgm/devpeek36-soft-tech.mp3 (24s, 80 BPM).');
