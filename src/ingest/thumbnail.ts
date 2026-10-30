import {stat,rename,rm} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {extractCoverFrame} from './publish-kit.js';
import {getDurationSec} from '../assets/audio-tools.js';

const pending=new Map<string,Promise<string>>();

/** Opening-frame cover, regenerated only when missing or older than the video. */
export function ensureVideoThumbnail(videoPath:string,coverPath:string):Promise<string>{
 const key=resolve(coverPath),existing=pending.get(key);if(existing)return existing;
 const job=(async()=>{
  const video=await stat(videoPath);
  try{const cover=await stat(coverPath);if(cover.size>0&&cover.mtimeMs>=video.mtimeMs)return coverPath;}catch{/* Generate a missing cover. */}
  const duration=await getDurationSec(videoPath);
  if(!Number.isFinite(duration)||duration<=0)throw new Error('Video chưa có thời lượng hợp lệ để tạo thumbnail.');
  // Skip the entrance animation, but remain inside very short videos too.
  const time=Math.min(1,duration*.25);
  const temp=join(dirname(coverPath),`.thumbnail-${randomUUID()}.png`);
  try{
    try{await extractCoverFrame(videoPath,temp,time);}
    catch{await rm(temp,{force:true});await extractCoverFrame(videoPath,temp,0);}
    await rename(temp,coverPath);return coverPath;
  }
  finally{await rm(temp,{force:true});}
 })();
 pending.set(key,job);
 void job.finally(()=>pending.delete(key)).catch(()=>{});
 return job;
}
