import axios from 'axios';
import type {SourceContent} from './types.js';
export interface RepoSource extends SourceContent {sourceScope:string;sections:string[];truncated:boolean;readmePath:string;}
export function parseRepoUrl(input:string) {
 const u=new URL(input);const parts=u.pathname.split('/').filter(Boolean);
 if(u.protocol!=='https:'||u.hostname!=='github.com'||u.port||u.username||u.password||parts.length!==2||parts.some(x=>! /^[\w.-]+$/.test(x)||x==='.'||x==='..'))throw new Error('Dùng link repo https://github.com/owner/repo.');
 return {owner:parts[0],repo:parts[1].replace(/\.git$/,''),url:`https://github.com/${parts[0]}/${parts[1].replace(/\.git$/,'')}`};
}
export function readmeSource(input:string,markdown:string,path='README.md'):RepoSource {
 const r=parseRepoUrl(input);const sections=[...markdown.matchAll(/^#{1,4}\s+(.+)$/gm)].map(x=>x[1].replace(/[*`]/g,'').trim()).slice(0,60);
 const truncated=markdown.length>60000;
 const content=truncated?markdown.slice(0,50000)+'\n\n[SOURCE TRUNCATED: omitted middle; do not claim complete coverage]\n\n'+markdown.slice(-10000):markdown;
 return {title:`${r.repo} — ${r.owner}`,content,url:r.url,domain:'github.com',ogImage:`https://opengraph.githubassets.com/1/${r.owner}/${r.repo}`,sourceScope:`${path} công khai${truncated?' (đã rút gọn)':''}; chưa phân tích toàn bộ mã nguồn`,sections,truncated,readmePath:path};
}
/** Injectable HTTP reader for offline tests; preserves headings, code and later limitations. */
export async function fetchGithubReadme(input:string,get:(url:string)=>Promise<any>=async url=>(await axios.get(url,{timeout:12000,maxContentLength:1024*1024})).data):Promise<RepoSource> {
 const r=parseRepoUrl(input);
 try{
  const data=await get(`https://api.github.com/repos/${r.owner}/${r.repo}/readme`);
  if(data?.encoding==='base64'&&typeof data.content==='string')return readmeSource(r.url,Buffer.from(data.content,'base64').toString('utf8'),String(data.path||'README.md'));
 }catch{}
 for(const branch of ['main','master'])try{
  const raw=await get(`https://raw.githubusercontent.com/${r.owner}/${r.repo}/${branch}/README.md`);
  if(typeof raw==='string'&&raw.trim())return readmeSource(r.url,raw);
 }catch{}
 throw new Error('Không đọc được README công khai của repo. Hãy dán README vào tab Văn bản; web không tự bịa mô tả thay thế.');
}
