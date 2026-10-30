import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {ScriptSchema} from '../render/script-schema.js';
import {ensureRepositoryHero} from './repository-hero.js';
import type {VisualAsset} from './visuals.js';
const make=()=>{const s=ScriptSchema.parse(JSON.parse(readFileSync('tests/fixtures/studio-director.json','utf8')));s.metadata.source.url='https://github.com/a/b';return s;};
const logo:VisualAsset={id:'logo',label:'Logo',kind:'repo-logo',source:'https://raw.githubusercontent.com/a/b/main/logo.png',previewUrl:'/logo'};
it('automatically puts the project logo in the opening without changing narration or channel branding',async()=>{
 const s=make(),speech=s.scenes.map(x=>x.voiceText),metadata={...s.metadata};let calls=0;
 await ensureRepositoryHero(s,[logo],async()=>{calls++;return undefined;});
 expect(calls).toBe(0);expect(s.scenes[0].media?.presentation).toBe('logo');expect(s.scenes[0].media?.src).toBe('studio-asset:logo');
 expect(s.scenes.map(x=>x.voiceText)).toEqual(speech);expect(s.metadata).toEqual(metadata);
});
it('discovers missing identity and preserves explicit logos on subsequent renders',async()=>{
 const s=make();let calls=0;
 const discover=async()=>{calls++;return logo;};
 await ensureRepositoryHero(s,[],discover);await ensureRepositoryHero(s,[],discover);
 expect(calls).toBe(1);expect(s.scenes[0].media?.credit).toBe(logo.source);
});
it('keeps a labelled owner avatar fallback and leaves non-GitHub sources alone',async()=>{
 const s=make();await ensureRepositoryHero(s,[{...logo,id:'avatar',kind:'owner-avatar'}],async()=>undefined);
 expect(s.scenes[0].media?.src).toBe('studio-asset:avatar');
 s.metadata.source.url='https://example.com/article';delete s.scenes[0].media;let calls=0;
 await ensureRepositoryHero(s,[],async()=>{calls++;return logo;});expect(calls).toBe(0);expect(s.scenes[0].media).toBeUndefined();
});
