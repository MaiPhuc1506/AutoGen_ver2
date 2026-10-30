import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import axios from 'axios';
import { z } from 'zod';
import { UPLOAD_DIR } from './uploads.js';
import { captureUrlScreenshot } from '../media/screenshot.js';
import {imageSize} from '../media/image-size.js';
const exec = promisify(execFile);
const uuid = z.string().uuid();
export interface VisualAsset { id: string; label: string; kind: 'screenshot'|'readme-image'|'repo-logo'|'owner-avatar'|'upload'; source: string; previewUrl: string; width?:number;height?:number; }
export function visualPath(id: string) { return join(UPLOAD_DIR, uuid.parse(id) + '.visual.png'); }
export async function readVisual(id: string): Promise<VisualAsset & {path:string}> {
  const path=visualPath(id);
  const asset=JSON.parse(await readFile(join(UPLOAD_DIR,id+'.visual.json'),'utf8'));
  return {...asset,...await imageSize(path),path};
}
async function saveInfo(id:string,label:string,kind:VisualAsset['kind'],source:string) {
  const asset:VisualAsset={id,label:label.slice(0,100),kind,source,previewUrl:`/api/studio/visuals/${id}/file`};
  await writeFile(join(UPLOAD_DIR,id+'.visual.json'),JSON.stringify(asset));return asset;
}
export async function saveVisual(bytes:Buffer,name:string,kind:VisualAsset['kind']='upload',source='Tải lên bởi người dùng') {
  if (!bytes.length || bytes.length>10*1024*1024) throw new Error('Ảnh phải dưới 10 MB.');
  // Only raster input; SVG/HTML documents are never executed by this endpoint.
  if (!(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || bytes.subarray(0,3).equals(Buffer.from([255,216,255])) || bytes.subarray(0,4).toString()==='RIFF' && bytes.subarray(8,12).toString()==='WEBP' || bytes.subarray(0,6).toString().startsWith('GIF8'))) throw new Error('Chỉ nhận ảnh PNG, JPG, WebP hoặc GIF.');
  await mkdir(UPLOAD_DIR,{recursive:true});const id=randomUUID(),temp=join(UPLOAD_DIR,id+'.visual-input');
  try {
    await writeFile(temp,bytes);
    await exec('ffmpeg',['-y','-v','error','-i',temp,'-frames:v','1','-vf','scale=1600:1600:force_original_aspect_ratio=decrease','-threads','1',visualPath(id)],{timeout:20000,maxBuffer:1024*1024});
    return await saveInfo(id,name,kind,source);
  } catch {await rm(visualPath(id),{force:true});throw new Error('Không đọc được ảnh. Hãy chọn PNG/JPG/WebP hợp lệ.');}
  finally {await rm(temp,{force:true});}
}
export function githubRepoUrl(input:string) {
  const u=new URL(input);const p=u.pathname.split('/').filter(Boolean);
  if(u.protocol!=='https:' || u.hostname!=='github.com' || u.port || u.username || u.password || p.length!==2 || p.some(s=>! /^[\w.-]+$/.test(s) || s==='.' || s==='..')) throw new Error('Dùng link repo công khai https://github.com/owner/repo.');
  return `https://github.com/${p[0]}/${p[1].replace(/\.git$/,'')}`;
}
const IMAGE_HOSTS=new Set(['raw.githubusercontent.com','github.com','avatars.githubusercontent.com','user-images.githubusercontent.com','private-user-images.githubusercontent.com','opengraph.githubassets.com']);
export function readmeImageUrls(markdown:string,repo:string,branch:string):string[] {
  const rawBase=`https://raw.githubusercontent.com/${new URL(repo).pathname.slice(1)}/${branch}/`;
  const matches=[...markdown.matchAll(/!\[[^\]]*\]\(<?([^\s)>]+)>?(?:\s+"[^"]*")?\)|<img\b[^>]*\bsrc=["']([^"']+)["']/gi)];
  const urls=matches.map(m=>{try{const u=new URL(m[1]||m[2],rawBase);if(u.protocol!=='https:'||u.username||u.password||u.port||!IMAGE_HOSTS.has(u.hostname)|| /badge|shields\.io|\.svg(?:\?|$)/i.test(u.href))return '';return u.href;}catch{return '';}}).filter(Boolean);
  return [...new Set(urls)].slice(0,4);
}
export interface GithubVisualServices { screenshot:typeof captureUrlScreenshot; get: (url:string, binary?:boolean)=>Promise<any>; }
const defaults:GithubVisualServices={ screenshot:captureUrlScreenshot, get:async(url,binary=false)=>(await axios.get(url,{timeout:12000,maxRedirects:0,maxContentLength:10*1024*1024,responseType:binary?'arraybuffer':'text'})).data };

/** Prefer a named project logo or the main application's icon, never a screenshot/add-on icon. */
export function repositoryLogoUrls(markdown:string,repo:string,branch:string,paths:string[]=[]):string[]{
 const named=[...markdown.matchAll(/!\[([^\]]*)\]\(<?([^\s)>]+)>?(?:\s+"[^"]*")?\)|<img\b([^>]+)>/gi)].flatMap(m=>{
  const src=m[2]||m[3]?.match(/\bsrc=["']([^"']+)["']/i)?.[1];
  const alt=m[1]||m[3]?.match(/\balt=["']([^"']+)["']/i)?.[1]||'';
  const logoName=/(?:^|\/)(?:logo(?:[-_.][^/]*)?|(?:icon|favicon|ic_launcher)(?:[-_.](?:\d+(?:x\d+)?|dark|light))?)\.(?:png|jpg|jpeg|webp)(?:[?#]|$)/i;
  return src&&(/\blogo\b|\bbrandmark\b|^(?:(?:app|application|project)\s+)?icon$/i.test(alt.trim())||logoName.test(src))?readmeImageUrls(`![Logo](${src})`,repo,branch):[];
 });
 const files=paths.filter(p=>!p.split('/').some(v=>v==='..'||v==='.')&&!/^(?:addons?|examples?|node_modules|vendor|tests?)\//i.test(p)&&/(?:^|\/)(?:logo(?:[-_.][^/]*)?|(?:icon|favicon|ic_launcher)(?:[-_.](?:\d+(?:x\d+)?|dark|light))?)\.(?:png|jpg|jpeg|webp)$/i.test(p));
 files.sort((a,b)=>a.split('/').length-b.split('/').length||b.localeCompare(a));
 return [...new Set([...named,...files.map(p=>`https://raw.githubusercontent.com/${new URL(repo).pathname.slice(1)}/${branch}/${p}`)])].slice(0,4);
}
export async function collectGithubIdentity(input:string,services:GithubVisualServices=defaults,known?:{readme:string;branch:string;skipOwner?:boolean}):Promise<VisualAsset|undefined>{
 const repo=githubRepoUrl(input);let {readme,branch}=known||{readme:'',branch:'main'};
 if(!known)for(const b of ['main','master'])try{readme=String(await services.get(`https://raw.githubusercontent.com/${new URL(repo).pathname.slice(1)}/${b}/README.md`));branch=b;break;}catch{}
 let urls=repositoryLogoUrls(readme,repo,branch);
 if(!urls.length)try{
  const raw=await services.get(`https://api.github.com/repos/${new URL(repo).pathname.slice(1)}/git/trees/${branch}?recursive=1`);
  const tree=typeof raw==='string'?JSON.parse(raw):raw;
  if(Array.isArray(tree?.tree))urls=repositoryLogoUrls(readme,repo,branch,tree.tree.filter((x:any)=>x.type==='blob'&&typeof x.path==='string').map((x:any)=>x.path));
 }catch{}
 for(const url of urls)try{return await saveVisual(Buffer.from(await services.get(url,true)),'Logo repo · '+new URL(repo).pathname.split('/')[2],'repo-logo',url);}catch{}
 if(!known?.skipOwner)try{
  const owner=new URL(repo).pathname.split('/')[1],raw=await services.get(`https://api.github.com/users/${owner}`),meta=typeof raw==='string'?JSON.parse(raw):raw,u=new URL(meta.avatar_url);
  if(u.protocol==='https:'&&u.hostname==='avatars.githubusercontent.com'&&!u.port&&!u.username&&!u.password)return await saveVisual(Buffer.from(await services.get(u.href,true)),`Avatar tác giả · ${owner}`,'owner-avatar',u.href);
 }catch{}
 return undefined;
}

export async function collectGithubVisuals(input:string,services:GithubVisualServices=defaults) {
  const repo=githubRepoUrl(input);await mkdir(UPLOAD_DIR,{recursive:true});
  const assets:VisualAsset[]=[],warnings:string[]=[];
  const id=randomUUID(),tmp=join(UPLOAD_DIR,id+'.capture.jpg');
  const shot=await services.screenshot(repo,tmp,{width:1440,height:1100,timeoutMs:20000,fullPage:false});
  if(shot.success){try{assets.push(await saveVisual(await readFile(tmp),'GitHub · trang repo','screenshot',repo));}catch{warnings.push('Không lưu được screenshot.');}finally{await rm(tmp,{force:true});}}
  else warnings.push(shot.reason||'Không chụp được GitHub.');
  let readme='',branch='main';
  for(const b of ['main','master']) {try{readme=String(await services.get(`https://raw.githubusercontent.com/${new URL(repo).pathname.slice(1)}/${b}/README.md`));branch=b;break;}catch{}}
  for(const url of readmeImageUrls(readme,repo,branch)) {try{assets.push(await saveVisual(Buffer.from(await services.get(url,true)),'README · '+(new URL(url).pathname.split('/').pop()||'ảnh'),'readme-image',url));}catch{warnings.push('Một ảnh README không tải được hoặc không phải ảnh raster.');}}
  const logo=await collectGithubIdentity(repo,services,{readme,branch,skipOwner:true});if(logo)assets.push(logo);
  // An account avatar is labelled accurately; it is never claimed to be a project logo.
  const owner=new URL(repo).pathname.split('/')[1];
  try{const raw=await services.get(`https://api.github.com/users/${owner}`);const meta=typeof raw==='string'?JSON.parse(raw):raw;const u=new URL(meta.avatar_url);if(u.protocol==='https:'&&u.hostname==='avatars.githubusercontent.com')assets.push(await saveVisual(Buffer.from(await services.get(u.href,true)),`Avatar tác giả · ${owner}`,'owner-avatar',u.href));}catch{warnings.push('Không lấy được avatar tác giả.');}
  return {assets,warnings,repo};
}
