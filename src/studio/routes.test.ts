import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { studioRouter } from './routes.js';
import { readFile } from 'node:fs/promises';
vi.mock('../tts/tts-client.js', () => ({ createTtsClient: () => ({ generate: async (_t: string, out: string) => { const { writeFile } = await import('node:fs/promises'); await writeFile(out, Buffer.from('FAKE-MP3')); return { words:[],accuracy:'low' }; } }) }));
let server: Server; let url: string;
beforeAll(async()=>{
  const app=express();app.use(express.json());app.use('/api/studio',studioRouter);
  await new Promise<void>(resolve=>{server=app.listen(0,'127.0.0.1',()=>{const addr=server.address();url=`http://127.0.0.1:${typeof addr==='object'&&addr?addr.port:0}`;resolve();});});
});
afterAll(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));});
it('serves safe provider readiness without credentials',async()=>{
  const data=await(await fetch(url+'/api/studio/options')).json();
  expect(data.providers[0].ready).toBe(true);
  expect(JSON.stringify(data)).not.toMatch(/apiKey|accessToken/);
});
it('renders a working local preview and streams generated voice without network',async()=>{
  const preview=await(await fetch(url+'/api/studio/style-preview')).text();
  expect(preview).toContain('/api/studio/assets/gsap.min.js');
  expect(preview).toContain('repeat(-1).play()');
  const script=JSON.parse(await readFile('tests/fixtures/studio-editorial.json','utf8'));
  const response=await fetch(url+'/api/studio/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'Xin chào',voice:{...script.voice,speed:1}})});
  expect(response.status).toBe(200);expect(await response.text()).toBe('FAKE-MP3');
});
it('rejects malformed uploads and overlong preview text',async()=>{
  const bad=await fetch(url+'/api/studio/uploads?name=voice.wav',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:'bad bytes'});
  expect(bad.status).toBe(400);
  const long=await fetch(url+'/api/studio/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'x'.repeat(501)})});
  expect(long.status).toBe(400);
});
it('serves editable template catalogue and previews the actual workflow/code draft without TTS',async()=>{
  const catalogue=await(await fetch(url+'/api/studio/templates')).json();
  expect(catalogue.templates).toHaveLength(16);
  const script=JSON.parse(await readFile('tests/fixtures/studio-explainer.json','utf8'));
  const response=await fetch(url+'/api/studio/preview-script',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({script})});
  expect(response.status).toBe(200);const html=await response.text();
  expect(html).toContain('workflow-step');expect(html).toContain('code-window');expect(html).toContain('theme-midnight');expect(html).toContain("stage.style.left=((innerWidth-1080*scale)/2)");expect(html).not.toContain('<audio');
  expect(html.replace(/<[^>]*>/g,'')).toContain('AI, API, GitHub.');
});
it('rejects non-GitHub screenshot targets and executable visual uploads',async()=>{
  const capture=await fetch(url+'/api/studio/github-visuals',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:'http://127.0.0.1/private'})});
  expect(capture.status).toBe(400);
  const upload=await fetch(url+'/api/studio/visuals?name=x.svg',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:'<svg/>'});
  expect(upload.status).toBe(400);
});
it('serves all adapted packs with lightweight posters and real matching previews',async()=>{
 const data=await(await fetch(url+'/api/studio/style-packs')).json();expect(data.packs).toHaveLength(18);expect(data.packs.filter((p:any)=>p.adaptation)).toHaveLength(15);
 for(const id of ['flat-vector','hud','pixel']){
  const poster=await fetch(url+`/api/studio/style-packs/${id}/poster.svg`);expect(poster.status).toBe(200);expect(await poster.text()).toContain('<svg');
  const preview=await(await fetch(url+`/api/studio/style-preview?pack=${id}&motion=dynamic`)).text();expect(preview).toContain('pack-'+id);expect(preview).toContain('pack-art');
 }
 const bad=await fetch(url+'/api/studio/style-packs/not-a-pack/poster.svg');expect(bad.status).toBe(404);
});
it('reports the exact TTS input while retaining original script spelling and honors per-video pronunciation',async()=>{
 const script=JSON.parse(await readFile('tests/fixtures/studio-director.json','utf8'));script.scenes[0].voiceText='OpenDesign và Agent.';script.voice.pronunciationOverrides={Agent:'ây chình riêng'};
 const response=await fetch(url+'/api/studio/pronunciation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({script})});expect(response.status).toBe(200);
 const report=await response.json();expect(report.scenes[0].spoken).toBe('ô bình đi zai và ây chình riêng.');expect(script.scenes[0].voiceText).toBe('OpenDesign và Agent.');
});
it('exposes editable stable block IDs and reference previews with captions and manual timing',async()=>{
 const script=JSON.parse(await readFile('tests/fixtures/studio-explainer.json','utf8'));
 script.templatePack='reference';script.creative={presetId:'reference',pacingId:'narrated'};
 script.scenes[0].blockTiming={heading:{atSec:4}};
 const plan=await fetch(url+'/api/studio/block-plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scene:script.scenes[0]})});
 expect(plan.status).toBe(200);expect((await plan.json()).blocks[0].id).toBe('heading');
 const preview=await fetch(url+'/api/studio/preview-script',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({script})});
 const html=await preview.text();expect(preview.status).toBe(200);expect(html).toContain('reference-design');expect(html).toContain('data-reveal-at="4.000"');expect(html).toContain('data-timing-basis="manual"');expect(html).toContain('captions-container');
 const bad=await fetch(url+'/api/studio/block-plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scene:{...script.scenes[0],blockTiming:{heading:{atSec:-1}}}})});
 expect(bad.status).toBe(400);
});
it('validates imported JSON before review and preserves hero, accumulated cards and caption mode',async()=>{
 const script=JSON.parse(await readFile('tests/fixtures/studio-explainer.json','utf8'));
 script.templatePack='reference';script.captions={enabled:true,style:'minimal',highlightMode:'estimated'};
 script.scenes[0].templateData.hero={name:'AutoGen',before:'Dựng từng cảnh',after:'Nội dung → video dọc'};
 script.scenes[1].referenceBoard={cards:[{label:'Đầu ra',value:'1080 × 1920',tone:'mint'}]};
 const response=await fetch(url+'/api/studio/validate-script',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({script})});
 expect(response.status).toBe(200);const data=await response.json();
 expect(data.script.scenes[0].templateData.hero.name).toBe('AutoGen');
 expect(data.script.scenes[1].referenceBoard.cards[0].value).toBe('1080 × 1920');
 expect(data.script.captions.highlightMode).toBe('estimated');
 const bad=await fetch(url+'/api/studio/validate-script',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"script":{}}'});expect(bad.status).toBe(400);
});
it('reviews smart speech with expanded dates/numbers while retaining the original script words',async()=>{
 const script=JSON.parse(await readFile('tests/fixtures/studio-explainer.json','utf8'));
 script.voice.pronunciation='smart';script.scenes[0].voiceText='GitHub có 29.9K sao, RAM 16GB. Ngày 29/10/2026.';
 const response=await fetch(url+'/api/studio/pronunciation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({script})});
 expect(response.status).toBe(200);const result=await response.json();expect(result.scenes[0].spoken).toContain('hai mươi chín phẩy chín nghìn sao');expect(result.scenes[0].spoken).toContain('mười sáu gi ga bai');expect(result.scenes[0].spoken).toContain('tháng mười');expect(script.scenes[0].voiceText).toContain('29.9K');
});
