import {expect,it,vi} from 'vitest';
import {repositoryPronunciation} from './repository-pronunciation.js';

it('uses user corrections and known compound readings without an AI request',async()=>{
 const provider={name:'fake',generate:vi.fn(async()=>'{"reading":"unused"}')};
 expect(await repositoryPronunciation('https://github.com/Gathin23/cleanyourtv',provider)).toEqual({cleanyourtv:'cờ lin do ti vi'});
 expect(await repositoryPronunciation('https://github.com/owner/AutoVideoGen',provider)).toEqual({AutoVideoGen:'o tô vi đi ô gen'});
 expect(await repositoryPronunciation('https://github.com/owner/NewBrand',provider,{newbrand:'cách đọc riêng'})).toEqual({NewBrand:'cách đọc riêng'});
 expect(await repositoryPronunciation('https://github.com/owner/NewBrand',provider,{newbrand:'NewBrand'})).toEqual({NewBrand:'NewBrand'});
 expect(await repositoryPronunciation('manual',provider)).toEqual({});
 expect(provider.generate).not.toHaveBeenCalled();
});

it('automatically asks for a bounded phonetic reading of unfamiliar repository names',async()=>{
 const provider={name:'fake',generate:vi.fn(async()=>'```json\n{"reading":"niu bran"}\n```')};
 expect(await repositoryPronunciation('https://github.com/owner/NewBrand',provider)).toEqual({NewBrand:'niu bran'});
 expect(provider.generate).toHaveBeenCalledTimes(1);
 const [system,prompt]=provider.generate.mock.calls[0] as unknown as [string,string];
 expect(system).toContain('Không dịch nghĩa');expect(JSON.parse(prompt)).toEqual({repositoryName:'NewBrand'});
});

it('expands isolated tail consonants so Vietnamese TTS does not spell them as letter names',async()=>{
 expect(await repositoryPronunciation('https://github.com/owner/PersonaLive',{name:'fake',generate:async()=>'{"reading":"pơ sơ na lai v"}'})).toEqual({PersonaLive:'pơ sơ na lai vờ'});
});

it.each(['{"reading":"NewBrand"}','{"reading":"https://bad.example"}','{"reading":"<speak>text</speak>"}','{"reading":""}'])('rejects unusable automatic readings instead of storing them: %s',async response=>{
 await expect(repositoryPronunciation('https://github.com/owner/NewBrand',{name:'fake',generate:async()=>response})).rejects.toThrow();
});
