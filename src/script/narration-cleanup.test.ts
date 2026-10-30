import {it,expect} from 'vitest';
import {cleanNarration,appendUniqueNarration,cleanScriptNarration,validateNarrationRepetition} from './narration-cleanup.js';
import {readFileSync} from 'node:fs';
import {ScriptSchema} from '../render/script-schema.js';
it('removes repeated appended sentences without dropping the next new idea',()=>{
 expect(cleanNarration('Giao diện Apple TV. Giao diện Apple TV. Có dock bốn ứng dụng.')).toBe('Giao diện Apple TV. Có dock bốn ứng dụng.');
 expect(cleanNarration('Là repo mã nguồn mở. Dùng ADB qua Wi-Fi.','Là repo mã nguồn mở.')).toBe('Dùng ADB qua Wi-Fi.');
});

it.each(['Kết nối nhanh','Đồng bộ','Giao diện Apple TV','Dung lượng nhỏ'])('removes both copies of the appended filler %s',label=>{
 const detail='Máy tính và tivi cần kết nối vào cùng một mạng Wi-Fi.';
 expect(cleanNarration(`${detail} ${label}. ${label}.`)).toBe(detail);
});
it('collapses repeated phrases within a sentence without deleting a different use or reduplication',()=>{
 expect(cleanNarration('Kết nối nhanh, kết nối nhanh rồi chọn ứng dụng.')).toBe('kết nối nhanh rồi chọn ứng dụng.');
 expect(cleanNarration('Đồng bộ đồng bộ dữ liệu.')).toBe('đồng bộ dữ liệu.');
 expect(cleanNarration('Bấm từ từ để chọn ứng dụng. Kết nối mạng rồi kết nối tivi.')).toBe('Bấm từ từ để chọn ứng dụng. Kết nối mạng rồi kết nối tivi.');
});
it('rejects an entirely duplicated scene instead of retaining its original repetition',()=>{
 const s=ScriptSchema.parse(JSON.parse(readFileSync('tests/fixtures/studio-director.json','utf8')));
 s.scenes[1].voiceText=s.scenes[0].voiceText;
 expect(()=>cleanScriptNarration(s)).toThrow(/toàn bộ lời đọc lặp/);
});
it('rejects the same sentence repeated in distant scenes while allowing shared technical terms',()=>{
 const s=ScriptSchema.parse(JSON.parse(readFileSync('tests/fixtures/studio-director.json','utf8')));
 s.scenes[0].voiceText='Dùng ADB để kết nối tivi.';
 s.scenes[1].voiceText='Bật ADB trong phần cài đặt.';
 s.scenes[2].voiceText='Dùng ADB để kết nối tivi. Chạy lệnh sao lưu.';
 expect(()=>validateNarrationRepetition(s)).toThrow(/lặp lại câu/);
 s.scenes[2].voiceText='Chạy lệnh sao lưu bằng ADB.';
 expect(()=>validateNarrationRepetition(s)).not.toThrow();
});
it.each(['Kết nối nhanh.','Đồng bộ.'])('rejects short padding repeated across distant scenes: %s',label=>{
 const s=ScriptSchema.parse(JSON.parse(readFileSync('tests/fixtures/studio-director.json','utf8')));
 s.scenes[0].voiceText='Giới thiệu công cụ cho tivi. '+label;
 s.scenes[2].voiceText='Chạy tập lệnh theo hướng dẫn trong nguồn. '+label;
 cleanScriptNarration(s);
 expect(()=>validateNarrationRepetition(s)).toThrow(/lặp lại câu/);
});
it('removes the previous scene ending repeated at the next scene opening',()=>{
 expect(cleanNarration('để tắt quảng cáo. Sau đó cài launcher.','Dùng ADB để tắt quảng cáo.')).toBe('Sau đó cài launcher.');
});

it('drops old sentences repeated after a new addition as well as at its beginning',()=>{
 expect(appendUniqueNarration('Dùng ADB qua Wi-Fi.','Có thể sao lưu trước. Dùng ADB qua Wi-Fi.')).toBe('Dùng ADB qua Wi-Fi. Có thể sao lưu trước.');
});
