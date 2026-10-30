import {it,expect} from 'vitest';
import {mkdtemp,readFile,copyFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {saveVisual} from '../studio/visuals.js';
import {UPLOAD_DIR} from '../studio/uploads.js';
import {assignAutomaticVisuals} from '../studio/visual-policy.js';
import {processSceneMedia} from './media-manager.js';
import {ScriptSchema} from '../render/script-schema.js';
import {composeHtml} from '../render/html-composer.js';
import {validateCompositionImages} from '../render/hyperframes-runner.js';
const exec=promisify(execFile);
it('resolves repo image references into local phone/gallery assets and prevents broken-image exports',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'inline-images-'));let id:string|undefined;
 try{
  const image=join(dir,'source.png');await exec('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=c=navy:s=320x100','-frames:v','1',image]);
  const asset=await saveVisual(await readFile(image),'library.png','readme-image','https://raw.githubusercontent.com/a/b/main/docs/images/library.png');id=asset.id;
  const s=ScriptSchema.parse(JSON.parse(await readFile('tests/fixtures/studio-dynamic.json','utf8'))),scene=s.scenes[1];
  scene.templateData={template:'phone-mockup',title:'Backlot Library',screenSrc:'docs/images/library.png',caption:'Quản lý dự án'};
  scene.storyboard={intent:'Giao diện',visualBrief:'Thư viện dự án',basis:'source-asset',evidence:'Library',transitionReason:'Tiếp'};
  const args={script:s,sceneAudio:s.scenes.map(x=>({id:x.id,durationSec:2})),gapSec:0,bgImageRelPath:null,audioRelPath:'voice.mp3'};
  const missing=composeHtml(args);expect(missing).toContain('Ảnh minh họa chưa sẵn sàng');expect(missing).not.toContain('src="docs/images/library.png"');
  assignAutomaticVisuals(s,[asset]);expect(scene.media?.src).toBe('studio-asset:'+id);
  // An explicit review edit may reuse an image; unresolved gallery items get a visible fallback.
  s.scenes[2].templateData={template:'image-gallery',title:'Ảnh',images:[{src:'studio-asset:'+id},{src:'missing.png'}]};
  const media=await processSceneMedia(s,dir),html=composeHtml({...args,mediaMap:media.mediaMap});
  expect(html).toContain('desktop-frame');expect(html).toContain(`src="${media.mediaMap[scene.id].localRelPath}"`);expect(html).not.toContain('src="missing.png"');expect(html).not.toContain('class="visual-asset');
  await copyFile('assets/avatar.jpg',join(dir,'tiktok-avatar.jpg'));
  await expect(validateCompositionImages(dir,html)).resolves.toBeUndefined();
  await expect(validateCompositionImages(dir,html+'<img src="broken.png">')).rejects.toThrow(/Thiếu ảnh/);
  await expect(validateCompositionImages(dir,'<img src="https://example.com/a.png">')).rejects.toThrow(/chưa được lưu/);
  scene.media={type:'image',src:media.mediaMap[scene.id].localRelPath,fit:'contain',fx:'none'};
  const again=await processSceneMedia(s,dir);expect(again.mediaMap[scene.id].localRelPath).toBe(media.mediaMap[scene.id].localRelPath);
 }finally{if(id)for(const ext of ['visual.png','visual.json'])await rm(join(UPLOAD_DIR,id+'.'+ext),{force:true});await rm(dir,{recursive:true,force:true});}
},20000);
