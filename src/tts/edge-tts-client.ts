import { EdgeTTS, createSRT } from "edge-tts-universal";
import { writeFile } from "node:fs/promises";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import type { TtsClient, TtsTimingResult, WordTiming } from "./tts-client.js";


export interface EdgeTtsOpts {
  voice: string;         // e.g. "vi-VN-HoaiMyNeural" or "vi-VN-NamMinhNeural"
  rate?: string;         // e.g. "+0%", "+10%", "-5%"
  pitch?: string;        // e.g. "+0Hz"
  volume?: string;       // e.g. "+0%"
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Edge TTS client using Microsoft Edge online text-to-speech service (Free).
 * Uses edge-tts-universal with automatic fallback to python edge-tts CLI.
 *
 * Supports subtitle generation (SRT) and word boundary cues.
 */
export class EdgeTtsClient implements TtsClient {
  constructor(private cfg: EdgeTtsOpts) {}

  async generate(text: string, audioOutPath: string, srtOutPath?: string): Promise<TtsTimingResult> {
    // The Python client handles the current Edge handshake more reliably.
    if(!process.env.VITEST){for(let attempt=0;attempt<2;attempt++){const python=await this.tryPythonEdgeTts(text,audioOutPath,srtOutPath);if(python)return python;if(attempt===0)await sleep(1000);}}
    return await this.synthesizeWithRetry(text, audioOutPath, srtOutPath);
  }

  private async tryPythonEdgeTts(text:string,audioOutPath:string,srtOutPath?:string):Promise<TtsTimingResult|undefined>{
    try{
      return await new Promise<TtsTimingResult>((resolve,reject)=>{
        const child=spawn('python3',[fileURLToPath(new URL('../../scripts/edge-word-speech.py',import.meta.url))],{stdio:['pipe','pipe','pipe']});
        let output='';const timer=setTimeout(()=>{child.kill();reject(new Error('Edge TTS timeout'));},20000);
        child.stdout.on('data',c=>{output+=c.toString();});child.stderr.on('data',()=>{});
        child.on('error',err=>{clearTimeout(timer);reject(err);});
        child.on('close',code=>{clearTimeout(timer);try{if(code!==0)throw Error();const result=JSON.parse(output);if(!Array.isArray(result.words))throw Error();resolve(result);}catch{reject(new Error('Edge TTS word timing unavailable'));}});
        child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({text,audio:audioOutPath,srt:srtOutPath,...this.cfg}));
      });
    }catch{return undefined;}
  }

  private async synthesizeWithRetry(
    text: string,
    audioOutPath: string,
    srtOutPath?: string,
  ): Promise<TtsTimingResult> {
    const delays = [1000];
    let lastErr: unknown;

    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        const tts = new EdgeTTS(text, this.cfg.voice, {
          rate: this.cfg.rate ?? "+0%",
          pitch: this.cfg.pitch ?? "+0Hz",
          volume: this.cfg.volume ?? "+0%",
        });

        let timer:ReturnType<typeof setTimeout>|undefined;
        const timeoutPromise=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('EdgeTTS synthesize timeout')),12000);});
        let result:Awaited<ReturnType<EdgeTTS['synthesize']>>;
        try{result=await Promise.race([tts.synthesize(),timeoutPromise]);}finally{clearTimeout(timer);}
        const buffer = Buffer.from(await result.audio.arrayBuffer());
        if (buffer.length === 0) {
          throw new Error("Edge TTS returned empty audio buffer");
        }
        await writeFile(audioOutPath, buffer);

        const words: WordTiming[] = [];
        if (result.subtitle && result.subtitle.length > 0) {
          for (const item of result.subtitle) {
            // Offset and duration are in 100ns units (10,000 units = 1ms)
            const startMs = Math.round(item.offset / 10_000);
            const durMs = Math.round(item.duration / 10_000);
            words.push({
              text: item.text.trim(),
              startMs,
              endMs: startMs + durMs,
            });
          }

          if (srtOutPath) {
            const srtContent = createSRT(result.subtitle);
            await writeFile(srtOutPath, srtContent, "utf8");
          }

          return { accuracy: "high", words };
        }

        return { accuracy: "low", words: [] };
      } catch (e) {
        lastErr = e;
        if (attempt === delays.length) throw new Error(`EdgeTTS không tạo được audio: ${e instanceof Error?e.message:String(e)}`,{cause:e});
        await sleep(delays[attempt]);
      }
    }
    throw lastErr;
  }
}

