/** DevPeek36 defaults for newly generated videos and publishing files. */
export const DEFAULT_HASHTAGS = ['#Ai', '#Github', '#xuhuong', '#DevPeek36'];
export const DEFAULT_VOICE_SPEED = 1.2;
export const DEFAULT_VOICE = {provider:'edge-tts',voiceId:'vi-VN-NamMinhNeural',speed:DEFAULT_VOICE_SPEED,settingsSource:'script',pronunciation:'smart'} as const;
export const DEFAULT_BGM = {enabled:true,src:'assets/bgm/devpeek36-soft-tech.mp3',volume:0.16,duck:true,duckVolume:0.06};

export function defaultCaption(title: string): string {
  return `${title}! Xem ngay để không bỏ lỡ xu hướng công nghệ mới. 🔥\n\n${DEFAULT_HASHTAGS.join(' ')}`;
}
