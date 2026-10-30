import type {Script} from '../render/script-schema.js';
import type {NarrationMeasurement} from '../studio/narration-timing.js';
import {applySpokenGithubHook} from './github-stars.js';
import {cleanNarration,cleanScriptNarration} from './narration-cleanup.js';
/** Range mode can shorten the opening independently, keeping its benefit in the first body scene. */
export async function measureWithShortHook(script:Script,out:string,measure:(s:Script,out:string)=>Promise<NarrationMeasurement>):Promise<NarrationMeasurement>{
 let measured=await measure(script,out);
 if(!script.explanationLevel||script.voice.uploadId)return measured;
 const i=script.scenes.findIndex(s=>s.type==='hook'),hook=script.scenes[i];
 if(!hook?.githubStarSpokenPrefix||measured.sceneSeconds[i]<=5.7)return measured;
 if(!hook.githubHookStyle){hook.githubHookStyle='compact';applySpokenGithubHook(script);measured=await measure(script,out);}
 if(measured.sceneSeconds[i]>5.7&&hook.githubHookStyle!=='identity-only'){
  const prefix=hook.githubStarSpokenPrefix!;
  const benefit=hook.voiceText.startsWith(prefix)?hook.voiceText.slice(prefix.length).trim():'';
  const body=script.scenes.find(s=>s.type==='body');
  if(benefit&&!body)return measured;
  if(benefit&&body)body.voiceText=cleanNarration(benefit+' '+body.voiceText);
  hook.voiceText=prefix;hook.githubHookStyle='identity-only';applySpokenGithubHook(script);cleanScriptNarration(script);
  measured=await measure(script,out);
 }
 return measured;
}

/** Voice outages must not trigger another script rewrite or be reported as an AI schema error. */
export class NarrationAudioError extends Error {
 constructor(cause:unknown){super('Dịch vụ giọng đọc chưa trả audio sau khi thử lại. Kịch bản nháp đã được giữ lại nhưng chưa đo được thời lượng nên chưa chuyển sang render. Đây không phải lỗi hết token Gemini.',{cause});this.name='NarrationAudioError';}
}
export async function measureDraftAudio(script:Script,out:string,measure:(s:Script,out:string)=>Promise<NarrationMeasurement>):Promise<NarrationMeasurement>{
 try{return await measureWithShortHook(script,out,measure);}
 catch(error){if(/(?:Edge.?TTS|Edge TTS|synthesize timeout|NoAudioReceived)/i.test(error instanceof Error?error.message:String(error)))throw new NarrationAudioError(error);throw error;}
}
