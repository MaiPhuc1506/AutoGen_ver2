import {expect,it} from 'vitest';
import {sourceLabel} from './source-label.js';
import {composeHtml} from './html-composer.js';
import {ScriptSchema} from './script-schema.js';
import {readFileSync} from 'node:fs';
it('shortens source URLs without query, credentials, branch or filename leakage',()=>{
 const raw='https://raw.githubusercontent.com/nexu-io/open-design/main/docs/screenshots/product-tour/home-workspace-2026-09-30-220844.png';
 expect(sourceLabel(raw)).toBe('GitHub · nexu-io/open-design');expect(sourceLabel(raw.replace('https://',''))).toBe('GitHub · nexu-io/open-design');
 expect(sourceLabel('https://name:secret@example.com/image.png?token=secret')).toBe('example.com');
 expect(sourceLabel('https://github.com/nexu-io/open-design')).toBe('GitHub · nexu-io/open-design');expect(sourceLabel('/Users/person/private/logo.png')).toBe('Tư liệu tải lên');expect(sourceLabel('A'.repeat(300)).length).toBeLessThanOrEqual(64);
});
it('renders one compact credit on cards and bounded labels on backgrounds without changing provenance',()=>{
 const script=ScriptSchema.parse(JSON.parse(readFileSync('tests/fixtures/studio-director.json','utf8')));
 const credit='https://raw.githubusercontent.com/nexu-io/open-design/main/docs/screenshots/product-tour/home-workspace-2026-09-30-220844.png';
 const record={sceneId:script.scenes[1].id,type:'image' as const,localRelPath:'media/shot.png',originalSrc:credit,credit,fit:'contain' as const,fx:'none' as const,presentation:'card' as const};
 const args={script,sceneAudio:script.scenes.map(s=>({id:s.id,durationSec:3})),gapSec:0,outroHoldSec:0,bgImageRelPath:null,audioRelPath:'voice.mp3',mediaMap:{[record.sceneId]:record}};
 const html=composeHtml(args);expect(html).toContain('GitHub · nexu-io/open-design');expect(html).not.toContain(credit);expect(html).not.toContain('class="media-credit-badge"');expect(record.credit).toBe(credit);
 const bg=composeHtml({...args,mediaMap:{[record.sceneId]:{...record,presentation:'background'}}});expect(bg).toContain('class="media-credit-badge">Nguồn: GitHub · nexu-io/open-design');expect(bg).not.toContain(credit);
});
