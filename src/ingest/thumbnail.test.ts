import {it,expect} from 'vitest';
import {mkdtemp,readFile,stat,utimes,rm} from 'node:fs/promises';
import {join,basename,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ensureVideoThumbnail} from './thumbnail.js';
import {app} from '../server.js';
import type {Server} from 'node:http';
const exec=promisify(execFile);
it('creates missing and stale covers, caches concurrent requests, and serves the correct downloadable thumbnail',async()=>{
 const dir=await mkdtemp(resolve('output/thumbnail-test-')),slug=basename(dir),video=join(dir,'video.mp4'),cover=join(dir,'cover.png');let server:Server|undefined;
 try{
  // A one-frame low-FPS video must still yield a cover when seeking past its frame.
  await exec('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=c=navy:s=1080x1920:r=2:d=0.2','-f','lavfi','-i','anullsrc=r=44100:cl=mono','-t','0.2','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac',video]);
  await Promise.all([ensureVideoThumbnail(video,cover),ensureVideoThumbnail(video,cover)]);
  expect((await readFile(cover)).subarray(1,4).toString()).toBe('PNG');
  const created=(await stat(cover)).mtimeMs;await ensureVideoThumbnail(video,cover);expect((await stat(cover)).mtimeMs).toBe(created);
  await utimes(cover,0,0);await ensureVideoThumbnail(video,cover);expect((await stat(cover)).mtimeMs).toBeGreaterThan(0);
  const {stdout}=await exec('ffprobe',['-v','error','-show_entries','stream=width,height','-of','json',cover]);expect(JSON.parse(stdout).streams[0]).toMatchObject({width:1080,height:1920});
  await new Promise<void>(done=>{server=app.listen(0,'127.0.0.1',()=>done());});const addr=server!.address();const base=`http://127.0.0.1:${typeof addr==='object'&&addr?addr.port:0}`;
  const image=await fetch(`${base}/api/videos/${slug}/thumbnail`);expect(image.status).toBe(200);expect(image.headers.get('content-type')).toContain('image/png');
  const download=await fetch(`${base}/api/videos/${slug}/thumbnail?download=1`);expect(download.headers.get('content-disposition')).toContain(`${slug}-cover.png`);
  const list=await(await fetch(base+'/api/videos')).json();expect(list.find((v:any)=>v.slug===slug).thumbnailUrl).toContain(`/api/videos/${slug}/thumbnail?v=`);
  expect((await fetch(base+'/api/videos/missing-thumbnail-video/thumbnail')).status).toBe(404);
  expect((await fetch(base+'/api/videos/a%2Fb/thumbnail')).status).toBe(400);
 }finally{if(server)await new Promise<void>(done=>server!.close(()=>done()));await rm(dir,{recursive:true,force:true});}
},15000);
