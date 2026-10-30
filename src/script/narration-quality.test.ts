import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {ScriptSchema} from '../render/script-schema.js';
import {validateNarration} from './narration-quality.js';
it('rejects mangled wildcard versions and raw spoken URLs in generated drafts',()=>{
 const s=ScriptSchema.parse(JSON.parse(readFileSync('tests/fixtures/studio-director.json','utf8')));
 s.scenes[1].voiceText='Dùng pnpm phiên bản mười chấm ba mươi ba chấm ít.';
 expect(()=>validateNarration(s)).toThrow(/phiên bản bị phiên âm sai/);
 s.scenes[1].voiceText='Dùng pnpm 10.33.x.';expect(()=>validateNarration(s)).not.toThrow();
 s.scenes[1].voiceText='Xem https://raw.githubusercontent.com/a/b/main/image.png';expect(()=>validateNarration(s)).toThrow(/URL thô/);
});

it('uses measured hook seconds instead of the legacy word cap for automatic timing',()=>{
 const s=ScriptSchema.parse(JSON.parse(readFileSync('tests/fixtures/studio-director.json','utf8')));
 s.scenes[0].voiceText=Array(24).fill('repo').join(' ');
 expect(()=>validateNarration(s)).toThrow(/Hook quá dài/);
 expect(()=>validateNarration(s,{measureHook:true})).not.toThrow();
 s.scenes[0].voiceText='Công cụ có độ chính xác tuyệt đối';
 expect(()=>validateNarration(s,{measureHook:true})).toThrow(/khẳng định quảng cáo/);
});
