import {expect,it} from 'vitest';
import {readFile,rm,mkdtemp,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {githubRepoUrl,readmeImageUrls,saveVisual,readVisual,collectGithubVisuals} from './visuals.js';
import {UPLOAD_DIR} from './uploads.js';
import {processSceneMedia} from '../media/media-manager.js';
import {ScriptSchema,TemplateData} from '../render/script-schema.js';
import {composeHtml} from '../render/html-composer.js';
import {speechText} from '../tts/lexicon.js';
import {normalizeVietnameseForTts} from '../utils/script-generator.js';
import {TEMPLATE_CATALOG} from '../render/template-catalog.js';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV9sAAAAASUVORK5CYII=','base64');
async function cleanup(id:string){await Promise.all([rm(join(UPLOAD_DIR,id+'.visual.png'),{force:true}),rm(join(UPLOAD_DIR,id+'.visual.json'),{force:true})]);}
it('keeps technical English in speech and fallback hooks while legacy dictionary stays opt-in',()=>{
 const text='AI API UI UX GitHub prompt motion React';
 expect(speechText(text,'original')).toBe(text);expect(normalizeVietnameseForTts(text)).toBe(text);
 expect(speechText('AI','lexicon')).not.toBe('AI');
});
it('restricts GitHub capture and rejects local links, credentials and SVG/HTML uploads',async()=>{
 expect(githubRepoUrl('https://github.com/owner/repo.git')).toBe('https://github.com/owner/repo');
 for(const url of ['http://github.com/a/b','https://localhost/a/b','https://github.com:8443/a/b','https://x@github.com/a/b','https://github.com/a/b/tree/main'])expect(()=>githubRepoUrl(url)).toThrow();
 await expect(readVisual('../config/llm')).rejects.toThrow();
 await expect(saveVisual(Buffer.from('<svg onload="alert(1)"/>'),'x.svg')).rejects.toThrow(/PNG/);
 expect(readmeImageUrls('![Logo](./assets/logo.png) ![badge](https://shields.io/a.svg) <img src="http://127.0.0.1/x"> ![x](https://raw.githubusercontent.com/a/b/main/a.png)','https://github.com/owner/repo','main')).toEqual(['https://raw.githubusercontent.com/owner/repo/main/assets/logo.png','https://raw.githubusercontent.com/a/b/main/a.png']);
});
it('normalizes actual raster uploads and copies selected media/logo into a portable render',async()=>{
 const asset=await saveVisual(png,'logo.png');const dir=await mkdtemp(join(tmpdir(),'visuals-test-'));
 try{
  expect((await readFile((await readVisual(asset.id)).path)).subarray(1,4).toString()).toBe('PNG');
  const s=ScriptSchema.parse(JSON.parse(await readFile('tests/fixtures/studio-dynamic.json','utf8')));s.voice.pronunciation='original';s.metadata.logoAssetId=asset.id;s.colorTheme='midnight';
  s.scenes[0].media={type:'image',src:'studio-asset:'+asset.id,fit:'contain',fx:'none',presentation:'card'};
  s.scenes[1].templateData={template:'workflow',title:'Prompt → code',steps:[{label:'Prompt',detail:'Mô tả kết quả'},{label:'Code',detail:'Kiểm tra source'}]};
  s.scenes[2].templateData={template:'code-window',title:'Code từ nguồn',language:'html',code:'<script>alert(1)</script>\nAPI GitHub',note:'Không thực thi code hiển thị'};
  const media=await processSceneMedia(s,dir);const html=composeHtml({script:s,sceneAudio:s.scenes.map(x=>({id:x.id,durationSec:2})),gapSec:0,bgImageRelPath:null,audioRelPath:'voice.mp3',mediaMap:media.mediaMap});
  expect(html).toContain('data-media="card"');expect(html).toContain('class="project-logo"');expect(html).toContain('workflow-connector');expect(html).toContain('theme-midnight');expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');expect(html).not.toContain('studio-asset:');
 }finally{await cleanup(asset.id);await rm(dir,{recursive:true,force:true});}
});
it('collects screenshot and README imagery behind injectable services without live network',async()=>{
 const data=await collectGithubVisuals('https://github.com/owner/repo',{
  screenshot:async(_u,out)=>{await writeFile(out,png);return {success:true,path:out};},
  get:async(url,binary)=>binary?png:url.includes('api.github')?JSON.stringify({avatar_url:'https://avatars.githubusercontent.com/u/1'}):'![Demo](./demo.png)',
 });
 try{expect(data.assets.map(a=>a.kind)).toEqual(['screenshot','readme-image','owner-avatar']);expect(data.assets[2].label).toContain('Avatar');expect(data.warnings).toEqual([]);}
 finally{for(const a of data.assets)await cleanup(a.id);}
});
it('registers editable templates and rejects oversized workflow/code content',()=>{
 for(const t of TEMPLATE_CATALOG)expect(TemplateData.safeParse(t.data).success,t.id).toBe(true);
 expect(TEMPLATE_CATALOG.map(t=>t.id)).toContain('workflow');expect(TEMPLATE_CATALOG.map(t=>t.id)).toContain('code-window');
 expect(TemplateData.safeParse({template:'workflow',title:'x',steps:[{label:'x',detail:'x'}]}).success).toBe(false);
 expect(TemplateData.safeParse({template:'code-window',title:'x',language:'sh',code:Array(12).fill('x').join('\n')}).success).toBe(false);
});

it('finds a real main-application icon while excluding screenshots and add-on icons',async()=>{
 const {repositoryLogoUrls,collectGithubIdentity}=await import('./visuals.js');
 expect(repositoryLogoUrls('![Icon tiles setting](docs/switches/icon_tiles.jpg)','https://github.com/a/b','main')).toEqual([]);
 expect(repositoryLogoUrls('![Demo](docs/demo.png)','https://github.com/a/b','main',['addons/remote/icon.png','docs/demo.png','launcher/app/src/main/res/mipmap-xhdpi/ic_launcher.jpg'])).toEqual(['https://raw.githubusercontent.com/a/b/main/launcher/app/src/main/res/mipmap-xhdpi/ic_launcher.jpg']);
 expect(repositoryLogoUrls('![Logo](assets/logo.png) ![UI](docs/ui.png)','https://github.com/a/b','main')).toEqual(['https://raw.githubusercontent.com/a/b/main/assets/logo.png']);
 const asset=await collectGithubIdentity('https://github.com/a/b',{screenshot:async()=>({success:false}),get:async(url,binary)=>binary?png:url.includes('/git/trees/')?{tree:[{type:'blob',path:'launcher/ic_launcher.png'}]}:'![Demo](docs/demo.png)'});
 try{expect(asset?.kind).toBe('repo-logo');expect(asset?.source).toContain('/launcher/ic_launcher.png');}finally{if(asset)await cleanup(asset.id);}
});
