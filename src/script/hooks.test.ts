import { describe,it,expect } from 'vitest';
import { buildHookSuggestions,compactText,sourceFacts } from './hooks.js';
import { generateScriptFromContent } from '../utils/script-generator.js';
import { ScriptSchema } from '../render/script-schema.js';
const title='Thiết kế giao diện với công cụ mới';
const source='Một câu mô tả tạo ra design system. Có 161 bảng màu theo ngành. Xuất kết quả sang React. Chưa thay thế việc kiểm tra thiết kế thủ công.';
describe('Source-grounded hook editing',()=>{
 it('leads with the concrete outcome and keeps evidence from the source',()=>{
  const hooks=buildHookSuggestions(title,source);
  expect(hooks[0].voiceText).toBe('Một câu mô tả, ra cả design system?');
  expect(hooks.some(h=>h.voiceText.includes('161'))).toBe(true);
  expect(hooks.every(h=>h.headline.length<=40&&h.subhead.length<=40)).toBe(true);
  expect(hooks.map(h=>h.voiceText).join(' ')).not.toMatch(/10x|tiết kiệm|100%|đột phá|miễn phí/i);
 });
 it('does not rewrite a negated source into a promised outcome',()=>{
  const hooks=buildHookSuggestions(title,'Chưa thể tạo design system từ một câu mô tả. Cần kiểm tra lại kết quả.');
  expect(hooks[0].voiceText).not.toBe('Một câu mô tả, ra cả design system?');
 });
 it('extracts sentences without splitting decimal facts or adding content',()=>{
  expect(sourceFacts('Phiên bản 1.5 hỗ trợ React.\nGiấy phép MIT.',title)).toEqual(['Phiên bản 1.5 hỗ trợ React.','Giấy phép MIT.']);
  expect(compactText('Một câu mô tả rất dài để kiểm tra ngắt chữ',20).length).toBeLessThanOrEqual(20);
 });
 it('fallback uses real facts instead of placeholder claims and fictitious numbers',async()=>{
  const script=await generateScriptFromContent({title,content:source});
  expect(ScriptSchema.safeParse(script).success).toBe(true);
  expect(script.scenes[1].templateData.template).toBe('stat-hero');
  expect(JSON.stringify(script)).toContain('161');
  expect(JSON.stringify(script)).not.toMatch(/hiệu năng vượt trội|Các Điểm Đột Phá|Cập Nhật Mới Nhất|NỔI BẬT/);
  const noNumbers=await generateScriptFromContent({title,content:'Công cụ xuất kết quả sang React. Thiết kế cần được kiểm tra lại.'});
  expect(noNumbers.scenes[1].templateData.template).toBe('callout');
 });
});
