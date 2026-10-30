import {expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {STYLE_PACKS,packPoster,packDecor,packVariables} from './style-packs.js';
import {ScriptSchema} from './script-schema.js';
import {composeHtml} from './html-composer.js';
it('has fifteen distinct adaptations and three native packs; posters and renderer share geometry',async()=>{
 expect(STYLE_PACKS).toHaveLength(18);expect(STYLE_PACKS.filter(p=>p.demo)).toHaveLength(15);
 const s=JSON.parse(await readFile('tests/fixtures/studio-explainer.json','utf8'));
 const content=JSON.stringify(ScriptSchema.parse(s).scenes);
 const signatures=new Set<string>();
 for(const p of STYLE_PACKS){
  const script=ScriptSchema.parse({...s,templatePack:p.id});
  const html=composeHtml({script,sceneAudio:script.scenes.map(x=>({id:x.id,durationSec:2})),gapSec:0,bgImageRelPath:null,audioRelPath:'voice.mp3'});
  expect(html).toContain('pack-'+p.id);expect(html).toContain(packVariables(p.id));expect(JSON.stringify(script.scenes)).toBe(content);
  expect(packPoster(p.id)).toContain('<svg');expect(packPoster(p.id)).not.toMatch(/(?:src|href)=["']https?:/);
  if(p.demo){expect(html).toContain('pack-motif-');expect(packDecor(p.id)).toContain('<svg');signatures.add(packDecor(p.id));}
 }
 expect(signatures.size).toBe(15);expect(()=>packPoster('../private')).toThrow();
});
it('extends scene count only with explicit deep-dive while legacy stays limited',async()=>{
 const s=JSON.parse(await readFile('tests/fixtures/studio-explainer.json','utf8'));
 s.scenes.splice(3,0,...Array.from({length:5},(_,i)=>({...s.scenes[2],id:'extra-'+i})));
 expect(ScriptSchema.safeParse(s).success).toBe(false);
 expect(ScriptSchema.safeParse({...s,contentMode:'deep-dive',targetDurationSec:120}).success).toBe(true);
});
