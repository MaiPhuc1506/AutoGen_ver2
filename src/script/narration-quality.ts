import type {Script} from '../render/script-schema.js';
import {validateNarrationRepetition} from './narration-cleanup.js';
/** Editorial checks for new Studio drafts; legacy imports remain unchanged. */
export function validateNarration(script:Script,options:{measureHook?:boolean}={}):void {
 validateNarrationRepetition(script);
 const problems:string[]=[];const hook=script.scenes[0].voiceText.trim();
 if(/^(bạn có biết|cập nhật mới nhất|vừa ra mắt)\b/i.test(hook))problems.push('Hook mở bằng câu chung chung; mở thẳng vào kết quả hoặc vấn đề cụ thể của repo.');
 if(!options.measureHook && hook.split(/\s+/).length>22)problems.push('Hook quá dài; rút lời mở đầu về khoảng 8–16 tiếng, tối đa 22 tiếng.');
 const filler=/độ chính xác tuyệt đối|đồng bộ hoàn hảo|không gặp bất kỳ trở ngại|không gặp bất cứ trở ngại|dễ dàng hơn bao giờ hết|thay đổi cuộc chơi/iu;
 for(const scene of script.scenes)if(filler.test(scene.voiceText))problems.push(`${scene.id}: bỏ khẳng định quảng cáo tuyệt đối, thay bằng chi tiết kiểm chứng được từ nguồn.`);
 for(const scene of script.scenes){
  if(/(?:chấm|phẩy)\s+ít\b/iu.test(scene.voiceText))problems.push(`${scene.id}: phiên bản bị phiên âm sai. Giữ số và wildcard gốc, ví dụ pnpm 10.33.x; không viết chấm ít.`);
  if(/https?:\/\//i.test(scene.voiceText))problems.push(`${scene.id}: không đọc URL thô trong lời nói; tên repo/công cụ là đủ, để lệnh hoặc URL ở hình nếu cần.`);
 }
 if(problems.length)throw new Error(problems.join(' '));
}
