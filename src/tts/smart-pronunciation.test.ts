import {expect,it,vi} from 'vitest';
import {prepareSpeechText,preparedPronunciationReport} from './smart-pronunciation.js';
it('uses the pinned Zero text rules for Vietnamese dates, times, prices and percentages without loading a voice model',async()=>{
 const original='Ngày 29/10/2026 lúc 15h30, giá 1.250.000đ, giảm 12,5%.';
 const spoken=await prepareSpeechText(original,'smart');
 expect(spoken).toContain('hai mươi chín tháng mười năm hai nghìn');expect(spoken).toContain('mười lăm giờ ba mươi phút');
 expect(spoken).toContain('một triệu hai trăm năm mươi nghìn đồng');expect(spoken).toContain('mười hai phẩy năm phần trăm');expect(original).toContain('1.250.000đ');
});
it('distinguishes version contexts from decimal counts and expands technical units',async()=>{
 const spoken=await prepareSpeechText('Node.js 22.10 và pnpm 10.33.x. Repo có 29.9K sao trên GitHub; RAM 16GB, tải trong 120ms.','smart');
 expect(spoken).toContain('hai mươi hai chấm mười');expect(spoken).toContain('mười chấm ba mươi ba chấm ích');
 expect(spoken).toContain('hai mươi chín phẩy chín nghìn sao');expect(spoken).toContain('ram mười sáu gi ga bai');expect(spoken).toContain('một trăm hai mươi mi li giây');
});
it('prioritizes user pronunciations, does not cascade replacements and preserves URLs, emails and code',async()=>{
 const text='API OpenAI; https://example.com/v1.2 user@example.com `npm install 1.2`. https://speech.invalid/keep0end';
 const spoken=await prepareSpeechText(text,'smart',{API:'AI riêng',OpenAI:'tên riêng'});
 expect(spoken).toContain('AI riêng tên riêng');expect(spoken).toContain('https://example.com/v1.2');expect(spoken).toContain('user@example.com');expect(spoken).toContain('`npm install 1.2`');expect(spoken).toContain('https://speech.invalid/keep0end');
});
it('keeps original and legacy modes intact and exposes the exact normalized text in pronunciation review',async()=>{
 const fake=vi.fn(async s=>s);
 expect(await prepareSpeechText('GitHub 16GB','original',undefined,fake)).toBe('GitHub 16GB');expect(fake).not.toHaveBeenCalled();
 expect(await prepareSpeechText('API','lexicon')).toBe('ây pi ai');
 const report=await preparedPronunciationReport('Giảm 12,5% với API.','smart');expect(report.spoken).toContain('mười hai phẩy năm phần trăm');expect(report.spoken).toContain('ây pi ai');expect(report.normalizer).toContain('zerotts-');
});
it('does not silently fall back to raw speech when the smart normalizer fails',async()=>{
 await expect(prepareSpeechText('12,5%','smart',undefined,async()=>{throw Error('unavailable');})).rejects.toThrow('unavailable');
});

it('reads repo names with Vietnamese sounds, preserving punctuation, user overrides and original display text',async()=>{
 const original='cleanyourtv, Clean Your TV và AutoVideoGen. CodeFlow!';
 const spoken=await prepareSpeechText(original,'smart');
 expect(spoken).toBe('cờ lin do ti vi, cờ lin do ti vi và o tô vi đi ô gen. câu đờ phlâu!');
 expect(await prepareSpeechText('CleanYourTV.','smart',{CLEANYOURTV:'cách đọc của tôi'})).toBe('cách đọc của tôi.');
 expect(await prepareSpeechText(original,'original')).toBe(original);
 expect(await prepareSpeechText('https://example.com/CodeFlow `AutoVideoGen` user@CodeFlow.com','smart')).toBe('https://example.com/CodeFlow `AutoVideoGen` user@CodeFlow.com');
 expect(original).toBe('cleanyourtv, Clean Your TV và AutoVideoGen. CodeFlow!');
});
