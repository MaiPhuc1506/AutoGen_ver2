import type {Script} from '../render/script-schema.js';
import type {VisualAsset} from './visuals.js';
type Candidate=Pick<VisualAsset,'id'|'kind'|'source'>;
function identity(a:Candidate):string{
 try{const url=new URL(a.source);if(['https:','http:'].includes(url.protocol)){url.hash='';return url.href.replace(/\/$/,'');}}catch{/* Upload labels are not source URLs. */}
 return a.id;
}

/** Fresh AI drafts only. Explicit choices in the review editor remain editable. */
export function assignAutomaticVisuals(script:Script,assets:Candidate[]):void{
 const used=new Set<string>(),layouts=new Set(['hook','callout','feature-list','stat-hero','phone-mockup','image-gallery']);
 const fromReference=(ref:string)=>assets.find(a=>ref==='studio-asset:'+a.id||ref===a.source||(!/^[a-z]+:/i.test(ref)&&a.source.endsWith('/'+ref.replace(/^\.\//,''))));
 for(const [index,scene] of script.scenes.entries()){
  const requested=scene.storyboard?.assetId || (scene.media?.src.startsWith('studio-asset:')?scene.media.src.slice('studio-asset:'.length):undefined);
  let asset=assets.find(a=>a.id===requested);
  const eligible=(a:Candidate)=>layouts.has(scene.templateData.template)&&scene.type!=='outro'&&a.kind!=='owner-avatar'&&a.kind!=='repo-logo'&&
   (a.kind==='screenshot'?index===0:scene.storyboard?.basis==='source-asset')&&!used.has(identity(a));
  if(!asset||!eligible(asset))asset=undefined;
  const td=scene.templateData;
  if(!asset&&td.template==='phone-mockup'){const match=fromReference(td.screenSrc);if(match&&eligible(match))asset=match;}
  // A repository overview is an orientation image, used only in the opening.
  if(index===0&&!asset)asset=assets.find(a=>a.kind==='screenshot'&&eligible(a));
  if(td.template==='image-gallery'){
   delete scene.media;
   for(const [i,image] of td.images.entries()){
    const match=fromReference(image.src)||(i===0?asset:undefined);
    if(match&&eligible(match)){used.add(identity(match));image.src='studio-asset:'+match.id;}
   }
   if(scene.storyboard)delete scene.storyboard.assetId;
  }else if(asset){
   used.add(identity(asset));
   scene.media={type:'image',src:'studio-asset:'+asset.id,fit:'contain',fx:'none',presentation:'card',credit:asset.source};
   if(td.template==='phone-mockup')td.screenSrc='studio-asset:'+asset.id;
   if(scene.storyboard)scene.storyboard.assetId=asset.id;
  }else{
   if(scene.media?.src.startsWith('studio-asset:'))delete scene.media;
   if(scene.storyboard)delete scene.storyboard.assetId;
  }
 }
}
