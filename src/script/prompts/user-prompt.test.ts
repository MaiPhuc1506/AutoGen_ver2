import {expect,it} from 'vitest';
import {buildUserPrompt,buildRetryPrompt} from './user-prompt.js';
const source={title:'Repo',content:'README',url:'https://example.com',domain:'example.com',ogImage:null};
it('uses 90 seconds without contradictory review duration or word budget',()=>{
 const prompt=buildUserPrompt(source,'review_60','Test',{contentMode:'deep-dive',targetDurationSec:90});
 expect(prompt).toContain('targetDurationSec=90');
 expect(prompt).toContain('Thời lượng mục tiêu duy nhất: 90 giây');
 expect(prompt).not.toContain('~60 giây');
 expect(prompt).not.toContain('190–220');
});
it('keeps legacy preset duration when no target is selected',()=>{
 expect(buildUserPrompt(source,'review_60')).toContain('~60 giây');
});

it('retains the full original source and measured duration feedback in repair requests',()=>{
 const original='FULL SOURCE: usage requires GPU and 16GB RAM. END OF SOURCE';
 const feedback='Measured 76 seconds; add source-backed detail for 90 seconds';
 const prompt=buildRetryPrompt(original,'{"scenes":[]}',feedback);
 expect(prompt).toContain(original);
 expect(prompt.indexOf(feedback)).toBeLessThan(prompt.indexOf(original));
 expect(prompt.lastIndexOf(feedback)).toBeGreaterThan(prompt.indexOf(original));
});

it('describes ranges as flexible durations rather than mandatory preset seconds',()=>{
 const prompt=buildUserPrompt(source,'review_60','Test',{contentMode:'deep-dive',targetDurationSec:75,explanationLevel:'standard',directingMode:'auto'});
 expect(prompt).toContain('Trên 60 đến 90 giây');expect(prompt).toContain('không bắt buộc đúng 75');expect(prompt).not.toContain('targetDurationSec=75');expect(prompt).toContain('explanationLevel=standard');
});

it('opens GitHub range drafts with a practical walkthrough and scales distinct examples by level',()=>{
 for(const [level,count] of [['quick','1'],['standard','2'],['detailed','3']] as const){
  const prompt=buildUserPrompt({...source,url:'https://github.com/a/b'},'review_60','Test',{explanationLevel:level,directingMode:'auto',contentMode:'overview'});
  expect(prompt).toContain('Ngay cảnh body đầu tiên dùng worked-example');
  expect(prompt).toContain(`${count} ví dụ`);expect(prompt).toContain('không bịa đáp án');
 }
 expect(buildUserPrompt(source,'review_60','Test',{explanationLevel:'standard',directingMode:'auto'})).not.toContain('MỞ BẰNG CÁCH REPO HOẠT ĐỘNG');
});
