import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {getDurationSec} from '../assets/audio-tools.js';
import {estimateWordTimings} from '../captions/estimator.js';
import type {Script} from '../render/script-schema.js';
import type {TtsTimingResult} from '../tts/tts-client.js';
const exec=promisify(execFile);
export interface TimedVoice extends TtsTimingResult {id:string;path:string;durationSec:number;}
export function durationPlan(durations:number[],target:number,gap:number,hold:number){
  const available=target-gap*durations.length-hold;
  const total=durations.reduce((a,b)=>a+b,0);
  if(available<=0||!Number.isFinite(total)||total<=0)throw new Error('Thời lượng audio không hợp lệ.');
  const tempo=total/available;
  if(tempo<.65||tempo>1.6)throw new Error(`Lời đọc hiện tại ${total.toFixed(1)}s lệch quá xa mục tiêu ${target}s. Hãy ${tempo>1?'rút gọn':'bổ sung'} lời đọc hoặc đổi thời lượng; hệ thống không cắt câu hay chèn khoảng lặng dài.`);
  return {tempo,durations:durations.map(d=>d/tempo)};
}
/** Derived WAV files leave raw TTS cache untouched. Every spoken sentence is preserved. */
export async function fitVoiceDuration(script:Script,voices:TimedVoice[],outDir:string,gap:number,hold:number):Promise<{voices:TimedVoice[];tempo:number}> {
  const plan=durationPlan(voices.map(a=>a.durationSec),script.targetDurationSec!,gap,hold);
  const dir=join(outDir,'voice-fitted');await mkdir(dir,{recursive:true});
  const fitted:TimedVoice[]=[];
  for(let i=0;i<voices.length;i++){
    const a=voices[i],duration=plan.durations[i],path=join(dir,`scene-${a.id}.wav`);
    await exec('ffmpeg',['-v','error','-y','-i',a.path,'-af',`atempo=${plan.tempo},apad,atrim=duration=${duration}`,'-ar','48000','-ac','1','-c:a','pcm_s16le',path]);
    const measured=await getDurationSec(path);
    fitted.push({...a,path,durationSec:measured,accuracy:a.words.length?a.accuracy:'low',words:a.words.length?a.words.map(w=>({...w,startMs:Math.round(w.startMs/plan.tempo),endMs:Math.min(Math.round(measured*1000),Math.round(w.endMs/plan.tempo))})):estimateWordTimings(script.scenes[i].voiceText,measured)});
  }
  return {voices:fitted,tempo:plan.tempo};
}
