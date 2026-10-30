import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {composeHtml} from './html-composer.js';
import {ScriptSchema} from './script-schema.js';
import {STYLE_PACKS} from './style-packs.js';

it('never burns a saved safe-zone guide into exports across any template pack',()=>{
 const fixture=JSON.parse(readFileSync('tests/fixtures/studio-director.json','utf8'));
 for(const pack of [undefined,...STYLE_PACKS.map(p=>p.id)]){
  const script=ScriptSchema.parse({...fixture,templatePack:pack,metadata:{...fixture.metadata,safeZoneOverlay:true}});
  const html=composeHtml({script,sceneAudio:script.scenes.map(s=>({id:s.id,durationSec:2})),gapSec:0,bgImageRelPath:null,audioRelPath:'voice.mp3'});
  expect(html).not.toContain('id="safe-zone-overlay"');
  expect(html).not.toContain('TOP SAFE (150px)');
  expect(html).not.toContain('ACTIONS SAFE (120px)');
  expect(script.metadata.safeZoneOverlay).toBe(true);
 }
});
