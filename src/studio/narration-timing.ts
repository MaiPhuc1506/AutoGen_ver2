import {EXPLANATION_LEVELS,explanationDuration} from './explanation-level.js';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import pLimit from 'p-limit';
import type {Script} from '../render/script-schema.js';
import {referenceSettings} from '../render/reference-design.js';
import {cachedSpeech,studioTts,voiceConfig} from './voice.js';

export interface NarrationMeasurement {sceneSeconds:number[];gapSec:number;holdSec:number;}
export function assessNarration(script:Script,measurement:NarrationMeasurement){
 const {sceneSeconds,gapSec,holdSec}=measurement;
 if(sceneSeconds.length!==script.scenes.length||sceneSeconds.some(s=>!Number.isFinite(s)||s<=0))throw new Error('Không đo được đầy đủ audio lời đọc.');
 const naturalSec=sceneSeconds.reduce((a,b)=>a+b,0)+gapSec*sceneSeconds.length+holdSec;
 const range=script.explanationLevel?EXPLANATION_LEVELS[script.explanationLevel]:undefined;
 const target=script.explanationLevel?explanationDuration(script.explanationLevel,naturalSec,script.renderSettings?.fps??24):script.targetDurationSec!;
 const available=target-gapSec*sceneSeconds.length-holdSec;
 if(!Number.isFinite(target)||available<=0)throw new Error('Thời lượng mục tiêu không hợp lệ.');
 const speechSec=sceneSeconds.reduce((a,b)=>a+b,0);
 const tempo=speechSec/available;
 const hookIndex=script.scenes.findIndex(s=>s.type==='hook');
 const hookSec=hookIndex<0?0:sceneSeconds[hookIndex]/tempo;
 const hookMaxSec=6;
 const accepted=tempo>=(range?0.95:0.85)&&tempo<=(range?1.05:1.15)&&hookSec>=2&&hookSec<=hookMaxSec;
 const words=script.scenes.reduce((n,s)=>n+s.voiceText.trim().split(/\s+/).length,0);
 const suggestedWords=Math.round(words/tempo);
 const rangeHint=range?`MỨC ${range.label}: ${range.description}. Chấp nhận thời lượng tự nhiên trong khoảng này, không ép về ${range.preferredSec}s. `:'';
 const feedback=rangeHint+`ĐO AUDIO TTS THẬT: mục tiêu video ${target}s, lời đọc ${speechSec.toFixed(2)}s, phần chuyển cảnh/kết ${(target-available).toFixed(2)}s, hệ số cân audio ${tempo.toFixed(3)}. Hook sau cân ${hookSec.toFixed(2)}s, phải nằm trong 2–${hookMaxSec}s. ${tempo<(range?0.95:0.9)?'BỔ SUNG thông tin thật từ nguồn':tempo>(range?1.05:1.1)?'RÚT GỌN lời đọc, giữ ý quan trọng':'Giữ ngân sách lời đọc tổng'}. Ngân sách gợi ý ${suggestedWords} tiếng cho toàn bộ video. Hook gồm tên repo, số sao đã xác minh (nếu có) và 1 câu lợi ích ngắn; chuyển giải thích sang body. Không bịa số sao GitHub, không lặp hay thêm câu đệm; không đổi tốc độ voice hoặc số giây đã chọn. Giữ JSON, coverage, storyboard và chữ hiển thị khớp lời đọc mới.`;
 return {targetSec:target,naturalSec,speechSec,tempo,hookSec,hookMaxSec,accepted,feedback};
}
export async function measureNarration(script:Script,outDir:string):Promise<NarrationMeasurement>{
 const cfg=voiceConfig(script.voice),client=studioTts(cfg,script.voice),limit=pLimit(cfg.ttsProvider==='edge-tts'?Math.max(2,cfg.ttsConcurrency):cfg.ttsConcurrency);
 const dir=join(outDir,'voice');await mkdir(dir,{recursive:true});
 const results=await Promise.allSettled(script.scenes.map(s=>limit(()=>cachedSpeech(s.voiceText,join(dir,`scene-${s.id}.mp3`),cfg,script.voice.speed,client,script.voice.pronunciation,script.voice.pronunciationOverrides))));
 const failed=results.find(r=>r.status==='rejected');if(failed?.status==='rejected')throw failed.reason;
 const audio=results.map(r=>{if(r.status==='fulfilled')return r.value;throw r.reason;});
 const reference=referenceSettings(script);
 return {sceneSeconds:audio.map(a=>a.durationSec),gapSec:reference?.gapSec??(script.visualStyle==='tech-editorial'?.08:.3),holdSec:reference?.outroHoldSec??(script.visualStyle==='tech-editorial'?.6:3)};
}
