import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {ScriptSchema} from './script-schema.js';
import {composeHtml} from './html-composer.js';
import {PACK_IDS} from './style-packs.js';
import {applyChannelOutro,channelOutroVoice} from '../script/channel-outro.js';
import {speechText} from '../tts/lexicon.js';
import {generateScriptFromContent} from '../utils/script-generator.js';
it('renders selected channel with a glass profile for reference and Follow interaction for legacy packs',()=>{
 const s=ScriptSchema.parse(JSON.parse(readFileSync('tests/fixtures/studio-director.json','utf8')));applyChannelOutro(s,'DevPeek36');
 for(const pack of [...PACK_IDS,undefined]){
  for(const motionPreset of ['calm','dynamic'] as const){
   const html=composeHtml({script:{...s,templatePack:pack,visualStyle:pack?'tech-editorial':'classic',motionPreset},sceneAudio:s.scenes.map(scene=>({id:scene.id,durationSec:3})),gapSec:0,outroHoldSec:0,bgImageRelPath:null,audioRelPath:'voice.mp3',tiktok:{displayName:'Unrelated',handle:'@other',followers:''}});
   if(pack==='reference'){expect(html).toContain('ref-profile tt-card');expect(html).toContain('>DevPeek36</strong>');expect(html).not.toContain('class="tt-cursor"');continue;}
   expect(html).toContain('class="tt-card"');expect(html).toContain('class="tt-cursor"');expect(html).toContain('class="tt-click-ring"');expect(html).toContain('Đã theo dõi');expect(html).toContain('class="tt-display-name">DevPeek36');expect(html).not.toContain('>Unrelated<');expect(html).toContain('function animateFollowCard');expect(html).not.toContain("tl.set(card, { opacity: 0, visibility: 'hidden' }");
  }
 }
});
it('adds a goodbye and repo/technology follow invitation to new drafts while keeping phonetics out of display text',async()=>{
 const s=ScriptSchema.parse(JSON.parse(readFileSync('tests/fixtures/studio-director.json','utf8')));const before=s.scenes[0].voiceText;
 applyChannelOutro(s,'DevPeek36');const last=s.scenes.at(-1)!;
 expect(last.voiceText).toBe(channelOutroVoice());expect(last.voiceText).toContain('Chào tạm biệt!');expect(last.voiceText).toContain('repo và tin tức công nghệ mới');expect(last.templateData.template==='outro'&&last.templateData.channelName).toBe('DevPeek36');expect(s.scenes[0].voiceText).toBe(before);
 expect(speechText(last.voiceText,'lexicon')).toContain('đép bít ba sáu');expect(last.voiceText).not.toContain('đép');
 const fallback=await generateScriptFromContent({title:'Repo',content:'Repo phục vụ lập trình viên. Có tài liệu hướng dẫn.',channel:'DevPeek36'});
 expect(fallback.scenes.at(-1)?.voiceText).toBe(channelOutroVoice());
});
it('removes complete font imports containing semicolons without swallowing the following card layout',async()=>{
 const {stripCssImports}=await import('./css.js');
 const source="@import url('https://fonts.example/css?family=Font:wght@400;700&display=block');\n.tt-card{position:absolute;display:flex}";
 expect(stripCssImports(source).trim()).toBe('.tt-card{position:absolute;display:flex}');
 const base=stripCssImports(readFileSync('src/render/templates/styles.css','utf8'));
 expect(base).not.toMatch(/700&display|900&family|@import/);expect(base).toContain('.tt-card {');
 const shared=readFileSync('src/render/templates/styles.follow-card.css','utf8');expect(shared).toContain('position:absolute;display:flex;align-items:center');
});
it('uses the channel logo in header and follow card, honors a chosen replacement and keeps other channels neutral',()=>{
 const s=ScriptSchema.parse(JSON.parse(readFileSync('tests/fixtures/studio-director.json','utf8')));applyChannelOutro(s,'DevPeek36');
 const args={script:s,sceneAudio:s.scenes.map(scene=>({id:scene.id,durationSec:3})),gapSec:0,outroHoldSec:0,bgImageRelPath:null,audioRelPath:'voice.mp3',tiktokAvatarRelPath:'tiktok-avatar.jpg'};
 const html=composeHtml(args);expect(html).toContain('class="project-logo" src="tiktok-avatar.jpg"');expect(html).toContain('class="tt-avatar tt-logo" src="tiktok-avatar.jpg" alt="Logo DevPeek36"');expect(html).not.toContain('tt-avatar tt-monogram');
 const replacement=composeHtml({...args,mediaMap:{__logo__:{sceneId:'__logo__',type:'image',originalSrc:'Upload',localRelPath:'media/project-logo.png',fit:'contain',fx:'none'}}});expect(replacement).toContain('class="project-logo" src="media/project-logo.png"');expect(replacement).toContain('class="tt-avatar tt-logo" src="media/project-logo.png"');
 s.metadata.channel='Other';applyChannelOutro(s,'Other');const neutral=composeHtml(args);expect(neutral).not.toContain('class="tt-avatar tt-logo"');expect(neutral).toContain('tt-avatar tt-monogram');
});
