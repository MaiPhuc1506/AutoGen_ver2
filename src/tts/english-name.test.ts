import {expect,it} from 'vitest';
import {englishNameReading} from './english-name.js';
import {mergePronunciationOverrides} from './lexicon.js';

it('reads joined, camelCase and separated English names only when every part is known',()=>{
 for(const name of ['CleanYourTV','cleanyourtv','clean-your-tv','clean_your_tv'])expect(englishNameReading(name,{})).toBe('cờ lin do ti vi');
 for(const name of ['AutoVideoGen','autovideogen','auto-video-gen'])expect(englishNameReading(name,{})).toBe('o tô vi đi ô gen');
 expect(englishNameReading('VoiceFlow',{})).toBe('voi sờ phlâu');
 expect(englishNameReading('CodeFlow',{code:'cách đọc riêng'})).toBe('cách đọc riêng phlâu');
 for(const name of ['NewUnfamiliarBrand','notreallyacode','làm','https://example.com/CodeFlow','data'])expect(englishNameReading(name,{})).toBeUndefined();
});

it('merges automatic readings with case-insensitive explicit user precedence',()=>{
 expect(mergePronunciationOverrides({NewBrand:'niu bran',API:'ây pi ai'},{newbrand:'cách riêng'})).toEqual({newbrand:'cách riêng',API:'ây pi ai'});
});
