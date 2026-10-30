import {it,expect} from 'vitest';
import {alignSpokenWords} from './spoken-alignment.js';
it('keeps original GitHub spelling while anchoring to actual expanded speech boundaries',()=>{
 const result=alignSpokenWords('Dùng GitHub ngay.',{accuracy:'high',words:[{text:'Dùng',startMs:100,endMs:300},{text:'ghít',startMs:400,endMs:650},{text:'háp',startMs:670,endMs:1000},{text:'ngay.',startMs:1600,endMs:1900}]});
 expect(result.accuracy).toBe('high');expect(result.words[1]).toEqual({text:'GitHub',startMs:400,endMs:1000});expect(result.words[2].startMs).toBe(1600);
});
it('maps an acronym to its full spoken phrase rather than losing its first syllable',()=>{
 for(const spelling of ['AI','AI,']){
 const result=alignSpokenWords(spelling+' tốt.',{accuracy:'high',words:[{text:'ây',startMs:100,endMs:300},{text:'ai',startMs:320,endMs:550},{text:'tốt.',startMs:700,endMs:900}]});
 expect(result.words[0]).toEqual({text:spelling,startMs:100,endMs:550});
 }
});

it('maps the entire phonetic repo name onto the original caption spelling',()=>{
 const spoken=['cờ','lin','do','ti','vi','có','sao.'];
 const result=alignSpokenWords('cleanyourtv có sao.',{accuracy:'high',words:spoken.map((text,i)=>({text,startMs:100+i*150,endMs:240+i*150}))});
 expect(result.accuracy).toBe('high');
 expect(result.words[0]).toEqual({text:'cleanyourtv',startMs:100,endMs:840});
 expect(result.words.map(w=>w.text).join(' ')).toBe('cleanyourtv có sao.');
});
