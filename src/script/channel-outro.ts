import type {Script} from '../render/script-schema.js';
export function channelOutroVoice(channel='DevPeek36'):string {
  return `Chào tạm biệt! Follow kênh ${channel} để cập nhật thêm nhiều repo và tin tức công nghệ mới nhé.`;
}
/** Default for newly generated Studio drafts; editing/importing existing narration remains possible. */
export function applyChannelOutro(script:Script,channel:string):void {
  const scene=script.scenes?.at(-1);
  if(scene?.type!=='outro'||scene.templateData?.template!=='outro')return;
  scene.voiceText=channelOutroVoice(channel);
  scene.templateData.ctaTop='Hẹn gặp lại!';
  scene.templateData.channelName=channel.slice(0,30);
  if(scene.storyboard){
    scene.storyboard.intent='Chào tạm biệt và mời theo dõi kênh';
    scene.storyboard.visualBrief='Thẻ kênh xuất hiện, con trỏ bấm Follow và đổi sang Đã theo dõi';
    scene.storyboard.basis='conceptual';
    scene.storyboard.transitionReason='Giữ trạng thái đã theo dõi rồi kết thúc video';
  }
}
