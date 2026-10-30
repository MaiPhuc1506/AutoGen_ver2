import type {Script} from '../render/script-schema.js';
import {collectGithubIdentity,githubRepoUrl,type VisualAsset} from './visuals.js';
/** Resolve only the opening product image. Channel branding and body illustrations are independent. */
export async function ensureRepositoryHero(script:Script,assets:VisualAsset[]=[],discover=collectGithubIdentity):Promise<void>{
 const hook=script.scenes.find(s=>s.type==='hook'&&s.templateData.template==='hook');
 if(!hook||hook.media?.presentation==='logo')return;
 let repo:string;try{repo=githubRepoUrl(script.metadata.source.url);}catch{return;}
 let image=assets.find(a=>a.kind==='repo-logo');
 if(!image)try{image=await discover(repo);}catch{}
 // When a repository has no project logo, its owner's avatar remains labelled as such in the asset library.
 image??=assets.find(a=>a.kind==='owner-avatar');
 if(!image)return;
 hook.media={type:'image',src:'studio-asset:'+image.id,fit:'contain',fx:'none',presentation:'logo',credit:image.source};
 if(hook.storyboard)hook.storyboard.assetId=image.id;
}
