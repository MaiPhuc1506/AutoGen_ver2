import {matchingGithubStars,formatGithubStars} from '../script/github-stars.js';
import type {Script,SceneType} from './script-schema.js';
import type {MediaAssetRecord} from '../media/media-manager.js';
import type {TiktokConfig} from '../config.js';
import {sourceLabel} from './source-label.js';
const e=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const svg=(path:string)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const icons={star:svg('<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2-6.2 3.2L7 14.2l-5-4.9 6.9-1L12 2Z"/>'),play:svg('<path d="m9 6 9 6-9 6Z"/>'),check:svg('<path d="m5 12 4 4L20 5"/>'),flow:svg('<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/><path d="M14 6h4v8M6 10v8h8"/>'),bolt:svg('<path d="m13 2-9 12h7l-1 8 10-13h-7Z"/>'),code:svg('<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-16-2 20"/>'),warn:svg('<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v4m0 4h.01"/>'),arrow:svg('<path d="M3 12h18m-6-6 6 6-6 6"/>')};
const heading=(cls:string,text:string)=>{
  const len=text.length;
  const fSize=len>32?'28px':len>20?'32px':'36px';
  return `<h2 class="ref-section-title ${cls}" style="--title-size:${fSize}">${e(text)}</h2>`;
};
const row=(cls:string,label:string,detail:string,index:number,tone='mint')=>`<div class="ref-row ${cls} ref-${tone}"><span class="ref-row-icon">${index===0?icons.flow:index===1?icons.check:icons.bolt}</span><div class="ref-row-copy"><strong>${e(label)}</strong>${detail?`<p>${e(detail)}</p>`:''}</div><span class="ref-status"><i></i>${String(index+1).padStart(2,'0')}</span></div>`;
const cell=(cls:string,label:string,value:string,tone='mint')=>{
  const vLen=value.length;
  const fSize=vLen>28?'28px':vLen>18?'34px':'44px';
  return `<div class="ref-cell ${cls} ref-${tone}"><small>${e(label)}</small><strong style="font-size:${fSize}">${e(value)}</strong></div>`;
};
function mediaPanel(media:MediaAssetRecord|undefined,cls='visual-asset'):string{
 if(!media)return '';
 const tag=media.type==='video'?`<video src="${e(media.localRelPath)}" autoplay muted loop playsinline></video>`:`<img src="${e(media.localRelPath)}" alt="Tư liệu nguồn" />`;
 return `<figure class="ref-media ${cls}" data-ref-enter=".08"><figcaption><span class="ref-window-dots"><i></i><i></i><i></i></span><span>${e(sourceLabel(media.credit||media.originalSrc||'Tư liệu nguồn'))}</span></figcaption>${tag}</figure>`;
}
export function referenceHero(script:Script,td:Extract<SceneType['templateData'],{template:'hook'}>){
 let repository='';try{const u=new URL(script.metadata.source.url);if(u.hostname==='github.com')repository=u.pathname.split('/').filter(Boolean).slice(0,2).join('/');}catch{}
 const fallback=repository.split('/')[1]||script.metadata.title.split(/[|·:]/)[0].trim();
 return {name:td.hero?.name||fallback.slice(0,40)||td.headline,category:td.hero?.category||(repository?'GITHUB OPEN SOURCE':'TECH EXPLAINER'),repository:td.hero?.repository||repository,before:td.hero?.before,after:td.hero?.after||td.subhead};
}
/** Reference uses composed boards; legacy layouts remain in html-composer. */
export function renderReferenceScene(a:{scene:SceneType;start:number;duration:number;script:Script;media?:MediaAssetRecord;gallery:(MediaAssetRecord|undefined)[];channelLogoPath?:string;tiktok:TiktokConfig}):string{
 const {scene,script,media}=a,td=scene.templateData;let inner='';
 switch(td.template){
 case 'hook':{
  const hero=referenceHero(script,td),logo=media?.presentation==='logo'?media:undefined;
  const stars=matchingGithubStars(script);
  const badge=stars?`<div class="ref-github-stars" data-count="${stars.count}" data-ref-enter=".03"><span class="ref-star-icon">${icons.star}</span><div class="ref-star-copy"><strong class="ref-star-number">${Array.from({length:13},(_,i)=>`<span data-star-step="${i}">${formatGithubStars(Math.round(stars.count*(1-Math.pow(1-i/12,3))))}</span>`).join('')}</strong><span>SAO TRÊN GITHUB</span></div><span class="ref-star-date">${e(new Date(stars.fetchedAt).toLocaleDateString('vi-VN',{timeZone:'UTC'}))}</span><i class="ref-star-spark spark-a">✦</i><i class="ref-star-spark spark-b">✦</i><i class="ref-star-spark spark-c">✦</i></div>`:'';
  inner=`<div class="ref-hook${stars?' ref-star-first':''}">${badge}<div class="ref-glass ${logo?'ref-product-media':''}" data-ref-enter="${stars?.count!==undefined?.9:.16}"><div class="ref-glass-halo"></div><i class="ref-scratch scratch-one"></i><i class="ref-scratch scratch-two"></i><i class="ref-scratch scratch-three"></i><div class="ref-product-icon">${logo?`<img src="${e(logo.localRelPath)}" alt="${e(hero.name)}"/>`:`<div class="ref-original-mark"><i></i><i></i><span>${icons.play}</span></div>`}</div><span class="ref-category">${e(hero.category)}</span></div><div class="ref-hook-identity"><h1 class="ref-product-name hook-headline" style="--repo-name-size:${hero.name.length>28?64:hero.name.length>16?82:110}px">${e(hero.name)}</h1>${hero.repository?`<div class="ref-repo-pill" data-ref-enter="${stars?.count!==undefined?1.15:.5}">${icons.code}<span>${e(hero.repository)}</span></div>`:''}${hero.after||hero.before?`<div class="ref-benefit hook-subhead">${hero.before?`<span>${e(hero.before)}</span><b>${icons.arrow}</b>`:''}<strong>${e(hero.after||'')}</strong></div>`:''}${media&&!logo?`<span class="ref-hook-source" data-ref-enter=".6">${e(sourceLabel(media.credit||media.originalSrc))}</span>`:''}</div></div>`;
  break;
 }
 case 'workflow':case 'data-flow':{
  const items=td.template==='workflow'?td.steps:td.nodes,cls=td.template==='workflow'?'workflow-step':'semantic-node';
  inner=`<div class="ref-panel ref-mechanism" data-ref-enter=".05">${heading('explainer-title',td.title)}<div class="ref-flow-overview${items.length>2?' ref-flow-many':''}">${items.map((v,i)=>`${i?`<div class="ref-connector"><i></i>${icons.arrow}<i></i></div>`:''}<div class="ref-mini-node${scene.referenceBoard?.rows?.length?' '+cls:''}"><strong>${e(v.label)}</strong><small>${e(v.detail)}</small></div>`).join('')}</div></div><div class="ref-rows">${(scene.referenceBoard?.rows?.length?[]:items).map((v,i)=>row(cls,v.label,v.detail,i,i%2?'mint':'blue')).join('')}</div>${td.template==='data-flow'&&td.caption?`<div class="ref-note semantic-caption">${e(td.caption)}</div>`:''}`;
  break;
 }
 case 'feature-list':inner=`<div class="ref-panel ref-feature-header" data-ref-enter=".05"><div class="ref-count">${td.bullets.length}</div><div>${heading('feat-title',td.title)}<div class="ref-mini-tags">${td.bullets.map(v=>`<span>${e(v)}</span>`).join('')}</div></div></div><div class="ref-rows">${td.bullets.map((v,i)=>row('feat-bullet',v,'',i,i%2?'mint':'violet')).join('')}</div>`;break;
 case 'comparison':inner=`<div class="ref-panel ref-comparison" data-ref-enter=".04"><div class="ref-section-label">${icons.flow}<span>TRƯỚC → SAU</span></div><div class="ref-two">${cell('cmp-card',td.left.label,td.left.value,'red')}${cell('cmp-card',td.right.label,td.right.value)}</div></div>`;break;
 case 'stat-hero':{
  const vLen=td.value.length;
  const vSize=vLen>8?'80px':vLen>4?'105px':'140px';
  const lLen=td.label.length;
  const lSize=lLen>24?'28px':lLen>16?'32px':'38px';
  inner=`<div class="ref-panel ref-stat-panel" data-ref-enter=".06"><span class="ref-stat-icon">${icons.bolt}</span><div class="stat-value ref-stat-value" style="font-size:${vSize}">${e(td.value)}</div><h2 class="ref-section-title stat-label" style="font-size:${lSize}">${e(td.label)}</h2>${td.context?`<p class="ref-note stat-context">${e(td.context)}</p>`:''}</div>`;
  break;
 }
 case 'callout':{
  const sLen=td.statement.length;
  const sSize=sLen>36?'32px':sLen>22?'38px':'44px';
  inner=`<div class="ref-panel ref-warning" data-ref-enter=".06"><span class="ref-row-icon">${icons.warn}</span><div>${td.tag?`<span class="ref-section-label">${e(td.tag)}</span>`:''}<h2 class="callout-statement ref-callout-text" style="--callout-size:${sSize}">${e(td.statement)}</h2></div></div>`;
  break;
 }
 case 'worked-example':inner=`<div class="ref-panel" data-ref-enter=".05">${heading('explainer-title',td.title)}<span class="ref-section-label">${td.basis==='conceptual'?'MINH HỌA KHÁI NIỆM':'VÍ DỤ TỪ NGUỒN · CHƯA CHẠY KIỂM CHỨNG'}</span></div><div class="ref-two">${cell('semantic-node','1 · ĐẦU VÀO',td.input,'blue')}${cell('semantic-node','2 · XỬ LÝ',td.operation)}</div>${cell('semantic-node','3 · KẾT QUẢ',td.output)}`;break;
 case 'code-window':inner=`<div class="ref-panel ref-code-heading" data-ref-enter=".04">${heading('explainer-title',td.title)}</div><div class="ref-code code-window"><div class="ref-code-toolbar"><span class="ref-window-dots"><i></i><i></i><i></i></span><span>${e(td.language)}</span><b>CODE</b></div><pre>${td.code.split('\n').map((l,i)=>`<span class="ref-code-line${td.highlightLines?.includes(i+1)?' is-highlight':''}"><b>${i+1}</b><code>${e(l)||' '}</code></span>`).join('')}</pre></div>${td.note?`<div class="ref-note ref-code-status code-note"><i></i>${e(td.note)}</div>`:''}`;break;
 case 'spec-table':inner=`<div class="ref-panel" data-ref-enter=".05">${heading('spec-header',td.productName)}<div class="ref-section-label">THÔNG SỐ TỪ NGUỒN</div></div><div class="ref-specs">${td.specs.map((v,i)=>`<div class="ref-spec-row spec-row"><span>${e(v.label)}</span><span class="ref-meter"><i style="width:${28+i%3*24}%"></i></span><strong>${e(v.value)}</strong></div>`).join('')}</div>`;break;
 case 'pros-cons':inner=`${td.title?`<div class="ref-panel" data-ref-enter=".05">${heading('pros-cons-title',td.title)}</div>`:''}<div class="ref-two ref-pros-cons"><div class="ref-panel ref-mint"><span class="ref-section-label">${icons.check} ĐIỂM MẠNH</span>${td.pros.map(v=>`<div class="pro-item ref-list-item">${e(v)}</div>`).join('')}</div><div class="ref-panel ref-gold"><span class="ref-section-label">${icons.warn} CẦN LƯU Ý</span>${td.cons.map(v=>`<div class="con-item ref-list-item">${e(v)}</div>`).join('')}</div></div>`;break;
 case 'verdict-score':inner=`<div class="ref-panel" data-ref-enter=".05">${heading('verdict-product',td.productName)}<div class="verdict-score-badge ref-score"><strong>${td.score}</strong><small>/${td.scale}</small></div><div class="ref-section-label">${e(td.verdict)}</div><p class="verdict-summary ref-note">${e(td.summary)}</p></div>`;break;
 case 'price-tag':inner=`<div class="ref-panel" data-ref-enter=".05">${heading('price-product',td.productName)}${td.variant?`<div class="ref-note">${e(td.variant)}</div>`:''}<div class="price-hero-box ref-price">${e(td.price)}</div>${td.note?`<div class="price-note ref-note">${e(td.note)}</div>`:''}</div>`;break;
 case 'image-gallery':inner=`${td.title?`<div class="ref-panel" data-ref-enter=".05">${heading('gallery-title',td.title)}</div>`:''}<div class="ref-gallery count-${td.images.length}">${td.images.map((v,i)=>`<div class="gallery-card">${mediaPanel(a.gallery[i]|| (i===0?media:undefined),'ref-gallery-media')}${v.caption?`<div class="ref-note">${e(v.caption)}</div>`:''}</div>`).join('')}</div>`;break;
 case 'phone-mockup':inner=`${td.title?`<div class="ref-panel" data-ref-enter=".05">${heading('mockup-title',td.title)}</div>`:''}<div class="phone-frame ref-screen">${mediaPanel(media,'ref-screen-media')}</div>${td.caption?`<p class="ref-note">${e(td.caption)}</p>`:''}`;break;
 case 'outro':inner=`<div class="ref-profile tt-card" data-ref-enter=".1"><div class="ref-avatar">${a.channelLogoPath?`<img src="${e(a.channelLogoPath)}" alt="${e(td.channelName)}"/>`:icons.play}</div><strong>${e(td.channelName)}</strong><span>@${e(td.channelName.replace(/^@/,''))}</span><span class="ref-channel-pill">#${e(td.channelName.replace(/[^\p{L}\p{N}]/gu,''))}</span><h2 class="out-cta-top">${e(td.ctaTop)}</h2><p>${e(td.source)}</p></div>`;break;
 }
 const extras=scene.referenceBoard;
 if(extras?.rows?.length)inner+=`<div class="ref-rows">${extras.rows.map((r,i)=>`<div class="ref-extra-row ref-row ref-${r.tone||'mint'}${r.disabled?' ref-disabled':''}"><span class="ref-row-icon">${r.disabled?icons.warn:icons.check}</span><div class="ref-row-copy"><strong>${e(r.title)}</strong><p>${e(r.detail)}</p></div>${r.badge?`<span class="ref-status"><i></i>${e(r.badge)}</span>`:''}</div>`).join('')}</div>`;
 if(extras?.cards?.length)inner+=`<div class="ref-two ref-bottom-cards">${extras.cards.map(r=>`<div class="ref-extra-card ref-cell ref-${r.tone||'mint'}"><small>${e(r.label)}</small><strong>${e(r.value)}</strong>${r.detail?`<p>${e(r.detail)}</p>`:''}</div>`).join('')}</div>`;
 const extraMedia=media&&!['hook','outro','image-gallery','phone-mockup'].includes(td.template)?mediaPanel(media):'';
 return `<div class="scene clip ref-scene" id="scene-${e(scene.id)}" data-start="${a.start.toFixed(2)}" data-duration="${a.duration.toFixed(2)}" data-layout="${td.template}" data-media="${media?.presentation||'none'}" data-transition="cut" data-transition-duration="0"><div class="ref-composition${td.template==='hook'?' ref-hero-composition':''}${td.template==='outro'?' ref-outro-composition':''}${extraMedia?' ref-with-media':''}"><div class="ref-board-canvas">${inner}${extraMedia}</div></div></div>`;
}
