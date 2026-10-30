import {it,expect} from 'vitest';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mixBgmWithVoice,getDurationSec} from './audio-tools.js';
const exec=promisify(execFile);
function wav(voice:boolean){
 const rate=44100,n=rate*7,b=Buffer.alloc(44+n*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*2,40);
 for(let i=0;i<n;i++){const t=i/rate,active=!voice||(t>=1&&t<3)||(t>=5&&t<7);b.writeInt16LE(Math.round((active?(voice?.35:.2)*Math.sin(2*Math.PI*(voice?440:1100)*t):0)*32767),44+i*2);}return b;
}
async function musicAt(path:string,start:number){
 const {stdout}=await exec('ffmpeg',['-v','error','-ss',String(start),'-i',path,'-t','0.5','-ar','44100','-ac','1','-f','f32le','pipe:1'],{encoding:'buffer',maxBuffer:200000});
 let re=0,im=0;const n=stdout.length/4;for(let i=0;i<n;i++){const x=stdout.readFloatLE(i*4),a=2*Math.PI*1100*i/44100;re+=x*Math.cos(a);im+=x*Math.sin(a);}return 2*Math.hypot(re,im)/n;
}
it('keeps music below narration, ducks during speech and honors the requested duck floor',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'lc-bgm-'));
 try{
  const voice=join(dir,'voice.wav'),music=join(dir,'music.wav'),low=join(dir,'low.mp3'),high=join(dir,'high.mp3');await writeFile(voice,wav(true));await writeFile(music,wav(false));
  await mixBgmWithVoice(voice,music,low,{volume:.25,duck:true,duckVolume:.02});
  await mixBgmWithVoice(voice,music,high,{volume:.25,duck:true,duckVolume:.18});
  const active=await musicAt(low,2),pause=await musicAt(low,4),higherFloor=await musicAt(high,2);
  expect(active).toBeLessThan(pause*.75);expect(higherFloor).toBeGreaterThan(active*1.5);
  expect(pause).toBeLessThan(.35*.4);expect(await getDurationSec(low)).toBeCloseTo(7,1);
 }finally{await rm(dir,{recursive:true,force:true});}
},15000);
