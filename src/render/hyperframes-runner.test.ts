import { it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { verifyRenderedVideo } from './hyperframes-runner.js';
const exec=promisify(execFile);
it('rejects incomplete, silent or wrong-sized render output before reporting success',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'render-verification-'));
 try {
  const good=join(dir,'good.mp4');
  await exec('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=s=1080x1920:r=30:d=0.5','-f','lavfi','-i','sine=duration=0.5','-c:v','libx264','-preset','ultrafast','-c:a','aac','-shortest',good]);
  await expect(verifyRenderedVideo(good,.5)).resolves.toBeUndefined();
  await expect(verifyRenderedVideo(good,10)).rejects.toThrow(/thời lượng/);
  const wrong=join(dir,'wrong.mp4');
  await exec('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=s=64x64:r=30:d=0.2','-c:v','libx264','-preset','ultrafast',wrong]);
  await expect(verifyRenderedVideo(wrong)).rejects.toThrow(/1080/);
  await expect(verifyRenderedVideo(join(dir,'missing.mp4'))).rejects.toThrow();
 }finally{await rm(dir,{recursive:true,force:true});}
},10000);
