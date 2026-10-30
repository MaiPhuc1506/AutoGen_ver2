import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {ScriptSchema} from '../render/script-schema.js';
import {assignAutomaticVisuals} from './visual-policy.js';
const make=()=>ScriptSchema.parse(JSON.parse(readFileSync('tests/fixtures/studio-dynamic.json','utf8')));
it('uses repo screenshots only in the opening and never fills examples or warnings with a repeated screenshot',()=>{
 const s=make();
 s.scenes.forEach(x=>{x.storyboard={intent:'Kiểm tra',visualBrief:'Kiểm tra',basis:'source-example',evidence:'Nguồn',transitionReason:'Tiếp'};x.storyboard.assetId='repo';x.media={type:'image',src:'studio-asset:repo',fit:'contain',fx:'none'};});
 const speech=s.scenes.map(x=>x.voiceText);
 assignAutomaticVisuals(s,[{id:'repo',kind:'screenshot',source:'https://github.com/a/b'}]);
 expect(s.scenes[0].media?.src).toBe('studio-asset:repo');
 expect(s.scenes.slice(1).every(x=>!x.media&&!x.storyboard?.assetId)).toBe(true);
 expect(s.scenes.map(x=>x.voiceText)).toEqual(speech);
});
it('deduplicates the same image source across IDs and excludes account avatars from automatic body illustrations',()=>{
 const s=make();const ids=['repo','diagram','same-diagram','avatar'];
 s.scenes.forEach((x,i)=>{x.storyboard={intent:'Kiểm tra',visualBrief:'Kiểm tra',basis:'source-asset',evidence:'Nguồn',transitionReason:'Tiếp',assetId:ids[i]};});
 const source='https://raw.githubusercontent.com/a/b/main/diagram.png';
 assignAutomaticVisuals(s,[{id:'repo',kind:'screenshot',source:'https://github.com/a/b'},{id:'diagram',kind:'readme-image',source},{id:'same-diagram',kind:'readme-image',source},{id:'avatar',kind:'owner-avatar',source:'https://avatars.githubusercontent.com/a'}]);
 expect(s.scenes[1].media?.src).toBe('studio-asset:diagram');expect(s.scenes[2].media).toBeUndefined();expect(s.scenes[3].media).toBeUndefined();
});
it('keeps distinct uploaded pictures even when their generic source label is the same',()=>{
 const s=make();
 for(const [i,id] of [[1,'one'],[2,'two']] as const)s.scenes[i].storyboard={intent:'Ảnh phù hợp',visualBrief:'Ảnh nguồn',basis:'source-asset',evidence:'Nguồn',transitionReason:'Tiếp',assetId:id};
 assignAutomaticVisuals(s,[{id:'one',kind:'upload',source:'Tải lên bởi người dùng'},{id:'two',kind:'upload',source:'Tải lên bởi người dùng'}]);
 expect(s.scenes[1].media?.src).toBe('studio-asset:one');expect(s.scenes[2].media?.src).toBe('studio-asset:two');
});
