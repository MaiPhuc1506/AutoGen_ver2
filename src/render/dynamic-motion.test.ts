import { expect,it } from 'vitest';
import { readFile,mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ScriptSchema } from './script-schema.js';
import { composeHtml } from './html-composer.js';
import { ensureEditorialSfx } from '../assets/editorial-sfx.js';
import { getDurationSec } from '../assets/audio-tools.js';
it('dynamic markup has word reveals, digit reveals and stage depth while calm retains original markup',async()=>{
 const script=ScriptSchema.parse(JSON.parse(await readFile('tests/fixtures/studio-dynamic.json','utf8')));
 const args={script,sceneAudio:script.scenes.map(s=>({id:s.id,durationSec:3})),gapSec:0,bgImageRelPath:null,audioRelPath:'voice.mp3'};
 const html=composeHtml(args);
 expect(html).toContain('class="tech-editorial motion-dynamic"');
 expect(html).toContain('class="hook-word');expect(html).toContain('class="stat-digit"');
 expect(html).toContain('class="feature-index"');expect(html).toContain('class="motion-grid"');
 expect(html).toContain('01 / 05');expect(html).toContain('class="scene-progress-fill"');
 const calm=composeHtml({...args,script:{...script,motionPreset:'calm'}});
 expect(calm).not.toContain('class="hook-word');expect(calm).not.toContain('class="motion-grid"');
 expect(calm).toContain('<body class="tech-editorial">');
 script.scenes[1].templateData={template:'stat-hero',value:'hero',label:'Tên trường hợp'};
 expect(composeHtml({...args,script})).toContain('class="layout-stat-hero"');
});
it('synthesizes short original sound effects locally without external calls',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'motion-sfx-'));
 try {
  const files=await ensureEditorialSfx(dir);
  expect(await getDurationSec(files.whoosh)).toBeLessThan(.3);
  expect(await getDurationSec(files.tick)).toBeLessThan(.2);
  expect(await ensureEditorialSfx(dir)).toEqual(files);
 }finally{await rm(dir,{recursive:true,force:true});}
});
