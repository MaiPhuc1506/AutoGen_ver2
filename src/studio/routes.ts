import {prepareSpeechText,preparedPronunciationReport} from '../tts/smart-pronunciation.js';
import {sceneBlocks,referenceSettings} from '../render/reference-design.js';
import {applyChannelOutro} from "../script/channel-outro.js";
import {sceneMediaEntries} from '../media/media-manager.js';
import {zeroTtsInstalled} from "../tts/zerotts-client.js";
import {ZERO_VOICES} from "../tts/zerotts-settings.js";
import {stripCssImports} from "../render/css.js";
import express from 'express';
import {STYLE_PACKS,stylePack,packPoster} from '../render/style-packs.js';
import { collectGithubVisuals, saveVisual, readVisual } from './visuals.js';
import { TEMPLATE_CATALOG } from '../render/template-catalog.js';
import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { composeHtml } from '../render/html-composer.js';
import { groupWordsIntoCues } from '../captions/grouper.js';
import { estimateWordTimings } from '../captions/estimator.js';
import { z } from 'zod';
import { saveUpload, readUpload, UPLOAD_DIR } from './uploads.js';
import { voiceConfig, studioTts } from './voice.js';
import { ScriptSchema } from '../render/script-schema.js';

export const studioRouter = express.Router();
const previewInput = z.object({ text: z.string().trim().min(1).max(500), voice: ScriptSchema.shape.voice });
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
studioRouter.get('/assets/gsap.min.js', (_req, res) => { res.sendFile(createRequire(import.meta.url).resolve('gsap/dist/gsap.min.js')); });
studioRouter.get('/assets/avatar.jpg', (_req, res) => { res.sendFile(join(ROOT, 'assets/avatar.jpg')); });
studioRouter.get('/bgm/soft-tech.mp3', (_req,res) => {res.type('audio/mpeg').sendFile(join(ROOT,'assets/bgm/devpeek36-soft-tech.mp3'));});
studioRouter.get('/fonts/BeVietnamPro-Bold.ttf', (_req, res) => { res.sendFile(join(ROOT, 'assets/fonts/BeVietnamPro-Bold.ttf')); });
studioRouter.get('/style.css', async (req, res) => {
  const base = stripCssImports(await readFile(join(ROOT, 'src/render/templates/styles.css'), 'utf8'));
  const extra = req.query.style === 'classic' ? '' : await readFile(join(ROOT, 'src/render/templates/styles.tech-editorial.css'), 'utf8');
  res.type('css').send(base + '\n' + extra + '\n' + await readFile(join(ROOT,'src/render/templates/styles.follow-card.css'),'utf8'));
});
studioRouter.get('/style-preview', async (req, res) => {
  try {
    const script = ScriptSchema.parse(JSON.parse(await readFile(join(ROOT, req.query.theme === 'midnight' ? 'tests/fixtures/studio-explainer.json' : req.query.motion === 'dynamic' ? 'tests/fixtures/studio-dynamic.json' : 'tests/fixtures/studio-editorial.json'), 'utf8')));
    script.metadata.channel='DevPeek36';applyChannelOutro(script,'DevPeek36');
    script.visualStyle = req.query.style === 'classic' ? 'classic' : 'tech-editorial';
    if(req.query.pack){const p=stylePack(String(req.query.pack));script.templatePack=p.id;script.visualStyle='tech-editorial';script.colorTheme=p.id==='explainer'?'midnight':'teal';}
    script.motionPreset = req.query.motion === 'dynamic' ? 'dynamic' : 'calm';
    if(script.templatePack==='reference')script.creative={presetId:'reference',pacingId:req.query.motion==='dynamic'?'quick':'narrated'};
    if(!req.query.pack)script.colorTheme = req.query.theme === 'midnight' ? 'midnight' : 'teal';
    if(req.query.layout){
      const chosen=TEMPLATE_CATALOG.find(t=>t.id===req.query.layout);if(!chosen)throw new Error('Bố cục không hợp lệ.');
      const source=script.scenes[chosen.id==='hook'?0:chosen.id==='outro'?script.scenes.length-1:1];
      script.scenes=[{...source,id:'preview',type:chosen.id==='hook'?'hook':chosen.id==='outro'?'outro':'body',templateData:chosen.data}];
    }
    if(script.templatePack==='reference'){
      script.captions={enabled:true,style:'minimal',highlightMode:'estimated'};
      const opening=script.scenes.find(s=>s.templateData.template==='hook');
      if(opening?.templateData.template==='hook')opening.templateData={...opening.templateData,hero:{name:'AutoGen',category:'OPEN SOURCE VIDEO TOOL',before:'Dựng từng cảnh',after:'Nội dung → video dọc'}};
    }
    const captionCues = script.scenes.flatMap((s, i) => groupWordsIntoCues(estimateWordTimings(s.voiceText, 3), { sceneStartMs: i * 3000 }).map(c => ({ ...c, accuracy: 'low' as const })));
    let html = composeHtml({ purpose: 'preview', script, sceneAudio: script.scenes.map(s => ({ id: s.id, durationSec: 3 })), gapSec: 0, outroHoldSec: 0,
      bgImageRelPath: null, audioRelPath: '', captionCues,
      tiktok: { displayName: script.metadata.channel, handle: '', followers: '' }, tiktokAvatarRelPath: '/api/studio/assets/avatar.jpg' });
    html = html.replace('href="styles.css"', `href="/api/studio/style.css?style=${script.visualStyle}"`)
      .replace(/(?:https:\/\/cdn.jsdelivr.net\/npm\/gsap@3.14.2\/dist\/)?gsap.min.js/g, '/api/studio/assets/gsap.min.js')
      .replace(/<link[^>]+(?:fonts.googleapis.com|fonts.gstatic.com)[^>]*>/g, '')
      .replace(/<img[^>]+class="brand-icon"[^>]*>/g, '')
      .replace(/<audio[\s\S]*?<\/audio>/g, '')
      .replace('</head>', '<style>html,body{width:100%;height:100%;}#stage{transform-origin:top left;}</style></head>')
      .replace('</body>', `<script>function fit(){const scale=Math.min(innerWidth/1080,innerHeight/1920);const stage=document.getElementById('stage');stage.style.transform='scale('+scale+')';stage.style.position='absolute';stage.style.left=((innerWidth-1080*scale)/2)+'px';stage.style.top='0';}fit();addEventListener('resize',fit);document.fonts.ready.then(()=>window.__timelines['news-video'].repeat(-1).play());</script></body>`);
    res.type('html').send(html);
  } catch (err: any) { res.status(500).send('Không mở được phong cách: ' + err.message); }
});
studioRouter.post('/preview-script',async(req,res)=>{
  try {
    const script=ScriptSchema.parse(req.body.script);
    if(referenceSettings(script))script.visualStyle='tech-editorial';
    if(script.templatePack){script.visualStyle="tech-editorial";if(script.templatePack==="explainer")script.colorTheme="midnight";}
    const mediaMap:Record<string,import('../media/media-manager.js').MediaAssetRecord>={};
    for(const scene of sceneMediaEntries(script)){if(scene.media.src.startsWith('studio-asset:')){
      const a=await readVisual(scene.media.src.slice('studio-asset:'.length));
      mediaMap[scene.id]={sceneId:scene.id,type:'image',originalSrc:a.source,localRelPath:a.previewUrl,fit:scene.media.fit,fx:scene.media.fx,presentation:scene.media.presentation,credit:scene.media.credit||a.source,width:a.width,height:a.height};
    }}
    if(script.metadata.logoAssetId){const a=await readVisual(script.metadata.logoAssetId);mediaMap.__logo__={sceneId:'__logo__',type:'image',originalSrc:a.source,localRelPath:a.previewUrl,fit:'contain',fx:'none'};}
    const durations=script.scenes.map(s=>Math.max(3,...Object.values(s.blockTiming||{}).map(t=>(t.atSec||0)+.9)));
    let cursor=0;
    const captionCues=script.scenes.flatMap((s,i)=>{const cues=groupWordsIntoCues(estimateWordTimings(s.voiceText,durations[i]),{sceneStartMs:cursor*1000}).map(c=>({...c,accuracy:'low' as const}));cursor+=durations[i];return cues;});
    let html=composeHtml({purpose:'preview',script,sceneAudio:script.scenes.map((s,i)=>({id:s.id,durationSec:durations[i]})),gapSec:0,outroHoldSec:0,bgImageRelPath:null,audioRelPath:'',captionCues,mediaMap,tiktokAvatarRelPath:'/api/studio/assets/avatar.jpg'});
    html=html.replace(/href="styles.css"/g,`href="/api/studio/style.css?style=${script.visualStyle==='classic'?'classic':'tech-editorial'}"`)
      .replace(/(?:https:\/\/cdn.jsdelivr.net\/npm\/gsap@3.14.2\/dist\/)?gsap.min.js/g,'/api/studio/assets/gsap.min.js')
      .replace(/<audio[\s\S]*?<\/audio>/g,'')
      .replace('</head>','<style>html,body{width:100%;height:100%;}#stage{transform-origin:top left;}</style></head>')
      .replace('</body>',`<script>function fit(){const scale=Math.min(innerWidth/1080,innerHeight/1920);const stage=document.getElementById('stage');stage.style.transform='scale('+scale+')';stage.style.position='absolute';stage.style.left=((innerWidth-1080*scale)/2)+'px';stage.style.top='0';}fit();addEventListener('resize',fit);document.fonts.ready.then(()=>{window.__timelines['news-video'].repeat(-1).play();});</script></body>`);
    res.type('html').send(html);
  }catch(err:any){res.status(400).json({error:'Không xem được bố cục: '+err.message});}
});
studioRouter.get('/style-packs',(_req,res)=>res.json({packs:STYLE_PACKS.map(p=>({...p,posterUrl:`/api/studio/style-packs/${p.id}/poster.svg`,previewUrl:`/api/studio/style-preview?pack=${p.id}&motion=${p.id==='reference'?'calm':'dynamic'}`,sourceUrl:p.demo?`https://github.com/Vincentwei1021/mg-styles-15/tree/main/demos/${p.demo}`:undefined,adaptation:Boolean(p.demo)}))}));
studioRouter.get('/style-packs/:id/poster.svg',(req,res)=>{try{res.type('svg').send(packPoster(String(req.params.id)));}catch{res.status(404).send('Template không tồn tại.');}});
studioRouter.post('/validate-script',(req,res)=>{
  const parsed=ScriptSchema.safeParse(req.body.script);
  if(!parsed.success)return res.status(400).json({error:parsed.error.message});
  return res.json({script:parsed.data});
});
studioRouter.post('/block-plan',(req,res)=>{
  try{const scene=ScriptSchema.shape.scenes.element.parse(req.body.scene);res.json({blocks:sceneBlocks(scene)});}
  catch(err:any){res.status(400).json({error:err.message});}
});
studioRouter.get('/templates', (_req,res)=>res.json({templates:TEMPLATE_CATALOG}));
studioRouter.post('/github-visuals', async(req,res)=>{
  try {const {url}=z.object({url:z.string().max(500)}).parse(req.body);res.json(await collectGithubVisuals(url));}
  catch(err:any){res.status(400).json({error:err.message});}
});
studioRouter.post('/visuals', express.raw({type:'application/octet-stream',limit:'10mb'}),async(req,res)=>{
  try {if(!Buffer.isBuffer(req.body))throw new Error('Gửi file ảnh dạng nhị phân.');res.json(await saveVisual(req.body,String(req.query.name||'Ảnh tải lên')));}
  catch(err:any){res.status(400).json({error:err.message});}
});
studioRouter.get('/visuals/:id/file',async(req,res)=>{
  try{res.type('png').sendFile((await readVisual(String(req.params.id))).path,{dotfiles:'allow'});}
  catch{res.status(404).json({error:'Không tìm thấy ảnh.'});}
});
studioRouter.get('/options', (_req, res) => {
  res.json({ providers: [
    { id: 'edge-tts', name: 'Edge TTS · dùng ngay', ready: true, voiceId: 'vi-VN-NamMinhNeural' },
    { id: 'vbee', name: 'Vbee', ready: Boolean(process.env.VBEE_APP_ID && process.env.VBEE_ACCESS_TOKEN), voiceId: process.env.VBEE_VOICE_CODE || 'n_hanoi_male_protrainer_education_vc' },
    { id: 'elevenlabs', name: 'ElevenLabs', ready: Boolean(process.env.ELEVENLABS_API_KEY), voiceId: process.env.ELEVENLABS_VOICE_ID || '' },
    { id: 'lucylab', name: 'LucyLab', ready: Boolean(process.env.VIETNAMESE_API_KEY), voiceId: process.env.VIETNAMESE_VOICEID || '' },
    {id:'zerotts',name:'ZeroTTS · Tiếng Việt local',ready:zeroTtsInstalled(),voiceId:'quangminh',voices:ZERO_VOICES},
  ] });
});
studioRouter.post('/uploads', express.raw({ type: 'application/octet-stream', limit: '30mb' }), async (req, res) => {
  try {
    if (!Buffer.isBuffer(req.body)) throw new Error('Gửi file audio dạng nhị phân.');
    const name = typeof req.query.name === 'string' ? req.query.name : '';
    res.json(await saveUpload(req.body, name));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});
studioRouter.get('/audio/:id', async (req, res) => {
  try { res.type('wav').sendFile((await readUpload(String(req.params.id))).path, { dotfiles: 'allow' }); }
  catch (err: any) { res.status(404).json({ error: err.message }); }
});
studioRouter.post('/pronunciation', async(req,res)=>{
  try{
    const script=ScriptSchema.parse(req.body.script);
    res.json({scenes:await Promise.all(script.scenes.map(async s=>({id:s.id,...await preparedPronunciationReport(s.voiceText,script.voice.pronunciation,script.voice.pronunciationOverrides)})))});
  }catch(err:any){res.status(400).json({error:err.message});}
});
studioRouter.post('/preview', async (req, res) => {
  const id = randomUUID();
  const path = join(UPLOAD_DIR, id + '.preview.mp3');
  try {
    const { text, voice } = previewInput.parse(req.body);
    if (voice.uploadId) throw new Error('Dùng nút phát audio đã tải lên để nghe giọng có sẵn.');
    const cfg = voiceConfig({ ...voice, settingsSource: 'script' });
    const { mkdir } = await import('node:fs/promises');
    await mkdir(UPLOAD_DIR, { recursive: true });
    await studioTts(cfg, { ...voice, settingsSource: 'script' }).generate(await prepareSpeechText(text, voice.pronunciation, voice.pronunciationOverrides), path);
    res.type('audio/mpeg').send(await readFile(path));
    await rm(path, { force: true });
  } catch (err: any) {
    await rm(path, { force: true });
    res.status(400).json({ error: err.message });
  }
});
studioRouter.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(err.type === 'entity.too.large' ? 413 : 400).json({ error: err.type === 'entity.too.large' ? 'File vượt quá 30 MB.' : 'Không đọc được audio.' });
});
