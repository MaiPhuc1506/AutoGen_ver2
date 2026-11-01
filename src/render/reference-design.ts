import {z} from 'zod';
import type {Script, SceneType} from './script-schema.js';
import type {CaptionCue} from '../captions/types.js';

export const CreativeOptions = z.object({
  presetId:z.enum(['reference','reference-quick']).optional(),
  hookType:z.enum(['problem-solution','question']).optional(),
  structureId:z.enum(['explainer','news','review']).optional(),
  pacingId:z.enum(['narrated','quick']).optional(),
});
export type CreativeSettings=z.infer<typeof CreativeOptions>;
export const BlockTiming=z.record(z.string().regex(/^[a-z][a-z0-9-]{0,49}$/),z.object({
  atSec:z.number().finite().min(0).max(180).optional(),
  phrase:z.string().trim().min(1).max(180).optional(),
  occurrence:z.number().int().min(1).max(50).optional(),
})).refine(v=>Object.keys(v).length<=30,'Tối đa 30 mốc mỗi cảnh');

/** New combinations use the same renderer; legacy scripts never opt in implicitly. */
export const REFERENCE_PRESETS={
  reference:{gapSec:0.08,outroHoldSec:0.6,entranceSec:0.42,fallbackStepSec:0.9},
  'reference-quick':{gapSec:0.04,outroHoldSec:0.45,entranceSec:0.25,fallbackStepSec:0.55},
} as const;
export function referenceSettings(script:Pick<Script,'templatePack'|'creative'>){
  if(script.templatePack!=='reference'&&!script.creative)return undefined;
  const id=script.creative?.pacingId==='quick'?'reference-quick':script.creative?.pacingId==='narrated'?'reference':script.creative?.presetId||'reference';
  return REFERENCE_PRESETS[id];
}
export function applyReferenceDefaults(script:Script,creative?:CreativeSettings):Script{
  script.templatePack='reference';script.visualStyle='tech-editorial';script.motionPreset='calm';
  script.creative={presetId:'reference',hookType:'problem-solution',structureId:'explainer',...creative};
  script.captions={enabled:true,style:'minimal',highlightMode:'estimated',...script.captions};
  return script;
}

export interface SceneBlock{id:string;selector:string;index:number;text:string;}
/** Stable IDs are independent of CSS, wording and resolved audio timestamps. */
export function sceneBlocks(scene:SceneType):SceneBlock[]{
  const td=scene.templateData,blocks:SceneBlock[]=[];
  const add=(id:string,selector:string,text:string,index=0)=>blocks.push({id,selector,index,text});
  if(scene.githubStarLeadIn&&td.template==='hook')add('stars','ref-github-stars','Số sao GitHub');
  switch(td.template){
    case 'hook':add('heading','hook-headline',td.hero?.name||td.headline);if(td.hero?.after||td.hero?.before||td.subhead)add('benefit','hook-subhead',[td.hero?.before,td.hero?.after||td.subhead].filter(Boolean).join(' '));break;
    case 'feature-list':add('heading','feat-title',td.title);td.bullets.forEach((s,i)=>add('item-'+i,'feat-bullet',s,i));break;
    case 'comparison':add('item-0','cmp-card',td.left.label+' '+td.left.value);add('item-1','cmp-card',td.right.label+' '+td.right.value,1);break;
    case 'stat-hero':add('heading','stat-value',td.value);add('benefit','stat-label',td.label);if(td.context)add('note','stat-context',td.context);break;
    case 'callout':add('heading','callout-statement',td.statement);break;
    case 'workflow':add('heading','explainer-title',td.title);td.steps.forEach((s,i)=>add('item-'+i,'workflow-step',s.label+' '+s.detail,i));break;
    case 'data-flow':add('heading','explainer-title',td.title);td.nodes.forEach((s,i)=>add('item-'+i,'semantic-node',s.label+' '+s.detail,i));if(td.caption)add('note','semantic-caption',td.caption);break;
    case 'worked-example':add('heading','explainer-title',td.title);[td.input,td.operation,td.output].forEach((s,i)=>add('item-'+i,'semantic-node',s,i));break;
    case 'code-window':add('heading','explainer-title',td.title);add('code','code-window',td.title);if(td.note)add('note','code-note',td.note);break;
    case 'spec-table':add('heading','spec-header',td.productName);td.specs.forEach((s,i)=>add('item-'+i,'spec-row',s.label+' '+s.value,i));break;
    case 'pros-cons':if(td.title)add('heading','pros-cons-title',td.title);td.pros.forEach((s,i)=>add('pro-'+i,'pro-item',s,i));td.cons.forEach((s,i)=>add('con-'+i,'con-item',s,i));break;
    case 'verdict-score':add('heading','verdict-product',td.productName);add('score','verdict-score-badge',String(td.score));add('benefit','verdict-summary',td.summary);break;
    case 'price-tag':add('heading','price-product',td.productName);add('price','price-hero-box',td.price);if(td.note)add('note','price-note',td.note);break;
    case 'image-gallery':if(td.title)add('heading','gallery-title',td.title);td.images.forEach((s,i)=>add('item-'+i,'gallery-card',s.caption||td.title||'Ảnh minh họa',i));break;
    case 'phone-mockup':if(td.title)add('heading','mockup-title',td.title);add('screen','phone-frame',td.caption||td.title||'Giao diện');break;
    case 'outro':add('heading','out-cta-top',td.ctaTop);add('profile','tt-card',td.channelName);break;
  }
  scene.referenceBoard?.rows?.forEach((r,i)=>add('detail-'+i,'ref-extra-row',r.title+' '+r.detail,i));
  scene.referenceBoard?.cards?.forEach((r,i)=>add('metric-'+i,'ref-extra-card',r.label+' '+r.value,i));
  if(scene.media&&!['image-gallery','phone-mockup'].includes(td.template))add('media',scene.type==='hook'?(scene.media.presentation==='logo'?'ref-product-media':'ref-hook-source'):'visual-asset',scene.storyboard?.intent||'Tư liệu minh họa');
  return blocks;
}
const normalize=(s:string)=>s.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function resolveBlockTiming(scene:SceneType,block:SceneBlock,index:number,start:number,duration:number,cues:CaptionCue[],profile:typeof REFERENCE_PRESETS[keyof typeof REFERENCE_PRESETS]){
  const setting=scene.blockTiming?.[block.id];
  const clamp=(sec:number)=>Math.max(0,Math.min(sec,Math.max(0,duration-profile.entranceSec-Math.min(.38,duration*.14))));
  if(setting?.atSec!==undefined)return {atSec:clamp(setting.atSec),basis:'manual' as const};
  if(scene.type==='hook'&&scene.templateData.template==='hook'&&scene.templateData.hero&&!setting?.phrase)return {atSec:clamp(block.id==='stars'?.03:block.id==='heading'?(scene.githubStarLeadIn?1.05:.34):block.id==='benefit'?(scene.githubStarLeadIn?1.3:.55):(scene.githubStarLeadIn?.9:.16)),basis:'estimated' as const};
  const words=cues.filter(c=>c.accuracy==='high').flatMap(c=>c.words).filter(w=>w.startMs>=start*1000&&w.startMs<(start+duration)*1000);
  const tokens=words.map(w=>normalize(w.text));
  const target=normalize(setting?.phrase||block.text).split(' ').filter(Boolean).slice(0,setting?.phrase?40:3);
  if(target.length>=(setting?.phrase?1:2)){let seen=0;for(let i=0;i<tokens.length;i++){
    if(target.every((t,k)=>tokens[i+k]===t)&&++seen===(setting?.occurrence||1))return {atSec:clamp(words[i].startMs/1000-start-0.04),basis:'word' as const};
  }}
  if(scene.type==='hook')return {atSec:clamp(block.id==='stars'?.03:block.id==='heading'?(scene.githubStarLeadIn?1.05:.34):block.id==='benefit'?(scene.githubStarLeadIn?1.3:.55):(scene.githubStarLeadIn?.9:.16)),basis:'estimated' as const};

  // Visual Beats for body scenes: Audio-synchronized 2-3 visual beats
  const sceneCues = cues.filter((c) => c.startSec >= start - 0.1 && c.startSec < start + duration - 0.4);
  let beat2At = Math.max(1.4, Math.min(duration * 0.45, 3.2));
  if (sceneCues.length >= 2) {
    const relCue2 = sceneCues[1].startSec - start;
    if (relCue2 >= 1.0 && relCue2 < duration - 1.2) {
      beat2At = relCue2;
    }
  }

  let beat3At = Math.max(beat2At + 1.2, Math.min(duration - 1.0, duration * 0.72));
  if (sceneCues.length >= 3) {
    const relCue3 = sceneCues[2].startSec - start;
    if (relCue3 > beat2At + 0.8 && relCue3 < duration - 0.8) {
      beat3At = relCue3;
    }
  }

  if (block.id === 'media') {
    // Media enters on Beat 2 when accompanying a headline/card, or at 0.04s if alone
    return { atSec: clamp(index === 0 ? 0.04 : beat2At), basis: 'estimated' as const };
  }
  if (index === 0) {
    return { atSec: clamp(0.04), basis: 'estimated' as const };
  }
  if (index === 1) {
    return { atSec: clamp(beat2At), basis: 'estimated' as const };
  }
  return { atSec: clamp(beat3At), basis: 'estimated' as const };
}

/** Attach resolved, inert data to renderer-owned nodes. Text is escaped by composer. */
export function decorateReferenceBlocks(html:string,scene:SceneType,start:number,duration:number,cues:CaptionCue[],profile:typeof REFERENCE_PRESETS[keyof typeof REFERENCE_PRESETS]):string{
  for(const [i,b] of sceneBlocks(scene).entries()){
    const timing=resolveBlockTiming(scene,b,i,start,duration,cues,profile);let found=0;
    html=html.replace(/<([a-z][a-z0-9-]*)\b([^>]*\bclass="([^"]*)"[^>]*)>/g,(tag,name,attrs,classes)=>{
      if(!classes.split(/\s+/).includes(b.selector)||found++!==b.index)return tag;
      return `<${name}${attrs} data-block-id="${b.id}" data-reveal-at="${timing.atSec.toFixed(3)}" data-reveal-duration="${profile.entranceSec}" data-timing-basis="${timing.basis}">`;
    });
  }
  return html;
}
