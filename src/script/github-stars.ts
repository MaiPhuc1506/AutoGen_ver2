import axios from 'axios';
import type {Script} from '../render/script-schema.js';
import {parseRepoUrl} from './github-source.js';
export type GithubStars=NonNullable<Script['metadata']['githubStars']>;
/** GitHub is authoritative; README badges and LLM-generated numbers are ignored. */
export async function fetchGithubStars(input:string,get:(url:string)=>Promise<unknown>=async url=>(await axios.get(url,{timeout:6000,maxContentLength:1000000,headers:{Accept:'application/vnd.github+json'}})).data):Promise<GithubStars|undefined>{
 try{
  const repo=parseRepoUrl(input);
  const data=await get(`https://api.github.com/repos/${repo.owner}/${repo.repo}`) as {stargazers_count?:unknown;full_name?:unknown};
  if(!Number.isSafeInteger(data?.stargazers_count)||Number(data.stargazers_count)<0)return;
  if(typeof data.full_name!=='string'||data.full_name.toLowerCase()!==`${repo.owner}/${repo.repo}`.toLowerCase())return;
  return {repoUrl:repo.url,count:Number(data.stargazers_count),fetchedAt:new Date().toISOString()};
 }catch{return;}
}
export async function hydrateGithubStars(script:Script):Promise<void>{
 if(script.templatePack!=='reference'&&!script.creative)return;
 const stars=await fetchGithubStars(script.metadata.source.url);
 // A failed refresh does not lend credibility to imported/LLM numbers.
 if(stars)script.metadata.githubStars=stars;else delete script.metadata.githubStars;
 for(const scene of script.scenes)if(scene.templateData.template==='hook')scene.githubStarLeadIn=Boolean(stars);
}
/** Only a snapshot for this exact source repo can appear on the hook. */
export function matchingGithubStars(script:Script):GithubStars|undefined{
 try{const source=parseRepoUrl(script.metadata.source.url),snapshot=script.metadata.githubStars;return snapshot&&parseRepoUrl(snapshot.repoUrl).url.toLowerCase()===source.url.toLowerCase()?snapshot:undefined;}catch{return;}
}
export const formatGithubStars=(count:number)=>new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(count);

/** Name comes from the source URL; only matched snapshots may supply a spoken count. */
export function applySpokenGithubHook(script:Script):void{
 if(script.voice.uploadId)return;
 let name:string;try{name=parseRepoUrl(script.metadata.source.url).repo;}catch{return;}
 const stars=matchingGithubStars(script);
 const scene=script.scenes.find(s=>s.type==='hook');if(!scene)return;
 const previous=scene.githubStarSpokenPrefix;
 let body=previous&&scene.voiceText.startsWith(previous)?scene.voiceText.slice(previous.length).trim():scene.voiceText;
 body=body.replace(/^[^.!?]*\b(?:sao|stars)\b[^.!?]*(?:GitHub|github)[^.!?]*[.!?]\s*/iu,'');
 // AI sometimes includes the introduction despite the benefit-only prompt.
 // Remove only a leading name/introduction, keeping the actual benefit intact.
 const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const introduction=new RegExp(`^(?:(?:đây là|repo|repository|dự án|công cụ)\\s+)*${escaped}(?:\\s+(?:giúp|cho phép)\\s+|\\s*[:—–,.-]\\s*|$)`,'iu');
 body=body.replace(introduction,'').trim();
 if(body)body=body[0].toLocaleUpperCase('vi')+body.slice(1);
 let prefix=`Repo ${name} trên GitHub.`;
 if(stars){
  const unit=stars.count>=1000000?1000000:1000;
  const count=stars.count>=1000?'khoảng '+new Intl.NumberFormat('vi',{maximumFractionDigits:1}).format(stars.count/unit)+(unit===1000000?' triệu':' nghìn'):String(stars.count);
  prefix=`${name} có ${count} sao trên GitHub.`;
 }
 if(scene.githubHookStyle)prefix=stars
  ?prefix.replace(/^(.+?) có (?:khoảng )?/u,'$1, ').replace(' trên GitHub.',' GitHub.')
  :`${name} trên GitHub.`;
 scene.voiceText=[prefix,body].filter(Boolean).join(' ');scene.githubStarSpokenPrefix=prefix;scene.githubStarLeadIn=Boolean(stars);
}
