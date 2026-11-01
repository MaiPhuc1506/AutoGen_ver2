import {readFile} from 'node:fs/promises';
import {expect,it} from 'vitest';
import {ScriptSchema} from './script-schema.js';
import {applyReferenceDefaults,sceneBlocks,resolveBlockTiming,referenceSettings,REFERENCE_PRESETS,BlockTiming} from './reference-design.js';
import {TEMPLATE_CATALOG} from './template-catalog.js';
import {composeHtml} from './html-composer.js';
import {buildHookSuggestions} from '../script/hooks.js';
import type {CaptionCue} from '../captions/types.js';
const fixture=async()=>ScriptSchema.parse(JSON.parse(await readFile('tests/fixtures/studio-explainer.json','utf8')));
it('renders every existing layout with the shared reference design and stable reveal IDs; legacy is opt-in',async()=>{
 const legacy=await fixture();expect(referenceSettings(legacy)).toBeUndefined();
 const script=applyReferenceDefaults(await fixture());
 for(const entry of TEMPLATE_CATALOG){
  const scene={...script.scenes[1],templateData:entry.data};
  const s={...script,scenes:[scene]};
  const html=composeHtml({script:s,sceneAudio:[{id:scene.id,durationSec:4}],gapSec:0,outroHoldSec:0,bgImageRelPath:null,audioRelPath:'voice.mp3'});
  expect(html).toContain('reference-design');expect(html).toContain('reference-specks');
  expect(html).not.toContain('class="pack-art');expect(html).not.toContain('class="scene-ordinal"');
  for(const block of sceneBlocks(scene))expect(html).toContain(`data-block-id="${block.id}"`);
 }
 expect(legacy.templatePack).toBeUndefined();
 expect(ScriptSchema.safeParse(script).success).toBe(true);
});
it('manual beats take precedence, accurate words anchor beats, low accuracy stays explicitly estimated',async()=>{
 const script=applyReferenceDefaults(await fixture());const scene=script.scenes[0];scene.templateData={template:'hook',headline:'Công cụ mới',subhead:'Thử ngay',kenBurns:'zoom-in'};
 const block=sceneBlocks(scene)[0];
 const cue={accuracy:'high',words:[{text:'Công',startMs:12000,endMs:12200},{text:'cụ',startMs:12200,endMs:12400},{text:'mới',startMs:12400,endMs:12600}]} as CaptionCue;
 expect(resolveBlockTiming(scene,block,0,10,5,[cue],REFERENCE_PRESETS.reference)).toEqual({atSec:1.96,basis:'word'});
 expect(resolveBlockTiming(scene,block,0,10,5,[{...cue,accuracy:'low'}],REFERENCE_PRESETS.reference).basis).toBe('estimated');
 scene.blockTiming={heading:{atSec:4.9}};
 expect(resolveBlockTiming(scene,block,0,10,5,[cue],REFERENCE_PRESETS.reference)).toEqual({atSec:4.2,basis:'manual'});
 expect(BlockTiming.safeParse({'<script>':{atSec:1}}).success).toBe(false);
 expect(BlockTiming.safeParse({heading:{atSec:-1}}).success).toBe(false);
});
it('adds a second pacing combination as data, without changing renderer; overrides remain independent',async()=>{
 const s=applyReferenceDefaults(await fixture(),{presetId:'reference-quick',hookType:'question',structureId:'news'});
 expect(referenceSettings(s)?.gapSec).toBe(.04);
 s.creative!.pacingId='narrated';expect(referenceSettings(s)?.gapSec).toBe(.08);
 expect(s.creative?.hookType).toBe('question');expect(s.creative?.structureId).toBe('news');
});
it('hook modes retain source facts and do not inherit reference-video numbers',()=>{
 const source='Mở nhiều tab gây khó theo dõi. Công cụ gom các chỉ số vào một trang.';
 const problem=buildHookSuggestions('Dashboard',source,'problem-solution');
 expect(problem[0].label).toBe('Vấn đề → giải pháp');expect(problem[0].voiceText).toMatch(/^Thay vì mở nhiều tab/u);
 const questions=buildHookSuggestions('Dashboard',source,'question');expect(questions.every(h=>h.voiceText.endsWith('?'))).toBe(true);
 expect(JSON.stringify([...problem,...questions])).not.toMatch(/15MB|37,6|28 widget/);
});
it('defaults both article and repository source-only drafts to the shared design without adding facts',async()=>{
 const {generateScriptFromContent}=await import('../utils/script-generator.js');
 for(const input of [{title:'Tin cập nhật',content:'Bản cập nhật hỗ trợ xuất báo cáo. Người dùng chọn định dạng trước khi tải về.',url:'https://example.test/tin'},{title:'Dashboard',content:'Mở nhiều tab gây khó theo dõi. Dashboard gom dữ liệu vào một trang. Dự án cần Docker để triển khai.',url:'https://github.com/example/dashboard'}]){
  const script=ScriptSchema.parse(await generateScriptFromContent(input));
  expect(script.templatePack).toBe('reference');expect(script.scenes.length).toBeGreaterThanOrEqual(5);
  expect(JSON.stringify(script)).not.toContain('Glance');
  expect(script.scenes[0].voiceText).toBeTruthy();
 }
});
it('separates product identity from narration and keeps accumulated board blocks editable',async()=>{
 const script=applyReferenceDefaults(await fixture());
 const hook=script.scenes[0];hook.templateData={template:'hook',headline:'Une longue phrase de hook',hero:{name:'Tool <X>',category:'OPEN SOURCE',before:'Manuel',after:'Automatisé'},kenBurns:'zoom-in'};
 hook.voiceText='Thay vì thao tác thủ công, hãy dùng công cụ.';
 const body=script.scenes[1];body.templateData={template:'data-flow',title:'Cơ chế',nodes:[{label:'Nguồn',detail:'Nội dung'},{label:'Video',detail:'Đầu ra'}]};
 body.referenceBoard={rows:[{title:'Chạy nền',detail:'Tắt khi đóng trang',tone:'red',disabled:true,badge:'TẮT'}],cards:[{label:'Đầu ra',value:'1080 × 1920',tone:'mint'}]};
 body.blockTiming={'detail-0':{atSec:2.4},'metric-0':{atSec:3.1}};
 script.scenes=[hook,body,...script.scenes.slice(2)];
 const html=composeHtml({script,sceneAudio:script.scenes.map(s=>({id:s.id,durationSec:6})),gapSec:0,outroHoldSec:0,bgImageRelPath:null,audioRelPath:'voice.mp3'});
 expect(html).toContain('Tool &lt;X&gt;');expect(html).not.toContain('>Une longue phrase de hook<');
 expect(html).toContain('ref-glass');expect(html).toContain('ref-benefit hook-subhead');
 for(const block of sceneBlocks(body))expect(html).toContain(`data-block-id="${block.id}"`);
 expect(html).toContain('data-block-id="detail-0" data-reveal-at="2.400"');
 expect(html).toContain('data-block-id="metric-0" data-reveal-at="3.100"');
 expect(html).toContain("filter:isHookGlass?'blur(4px)':'blur(0px)'");expect(html).toContain("filter:'blur(4px)'");
 expect(ScriptSchema.safeParse(script).success).toBe(true);
});
it('allows approximate caption highlighting only with an explicit option, preserving timestamp accuracy',async()=>{
 const script=applyReferenceDefaults(await fixture());script.scenes=script.scenes.slice(0,1);
 const cues=[{id:1,startMs:0,endMs:1000,startSec:0,endSec:1,text:'Xin chào',accuracy:'low',words:[{text:'Xin',startMs:0,endMs:400},{text:'chào',startMs:400,endMs:1000}]}] as CaptionCue[];
 const args={script,sceneAudio:[{id:script.scenes[0].id,durationSec:3}],gapSec:0,bgImageRelPath:null,audioRelPath:'voice.mp3',captionCues:cues};
 expect(composeHtml(args)).toContain('data-accuracy="low" data-highlight-mode="estimated"');
 script.captions!.highlightMode='accurate-only';expect(composeHtml(args)).toContain('data-accuracy="low" data-highlight-mode="accurate-only"');
 expect(cues[0].accuracy).toBe('low');
});

it('keeps opening identity labels out of generic media cards and displays the actual product image',async()=>{
 const script=applyReferenceDefaults(await fixture());const scene=script.scenes[0];
 scene.media={type:'image',src:'media/repo-logo.png',presentation:'logo',fit:'contain',fx:'none'};
 const args={script,sceneAudio:script.scenes.map(s=>({id:s.id,durationSec:4})),gapSec:0,bgImageRelPath:null,audioRelPath:'voice.mp3'};
 const media={sceneId:scene.id,type:'image' as const,originalSrc:scene.media.src,localRelPath:scene.media.src,presentation:'logo' as const,fit:'contain' as const,fx:'none' as const};
 const html=composeHtml({...args,mediaMap:{[scene.id]:media}});
 expect(html).toContain('class="ref-hook-identity"');expect(html).toContain('<img src="media/repo-logo.png"');
 expect(html).not.toContain('class="ref-glass visual-asset');expect(html).toContain('data-block-id="media"');
 const fallback=composeHtml({...args,mediaMap:{[scene.id]:{...media,presentation:'card'}}});
 expect(fallback).toContain('class="ref-hook-source"');expect(fallback).not.toContain('class="visual-asset ref-hook-source"');
});
