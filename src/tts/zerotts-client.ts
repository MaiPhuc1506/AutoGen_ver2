import axios from 'axios';
import {existsSync,readFileSync,openSync,writeFileSync,closeSync,mkdirSync} from 'node:fs';
import {writeFile,rm} from 'node:fs/promises';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import type {TtsClient} from './tts-client.js';
import {ZERO_VOICES,ZEROTTS_REVISION} from './zerotts-settings.js';
const exec=promisify(execFile);
const root=process.cwd();
export function zeroTtsInstalled():boolean {
 try{const installed=JSON.parse(readFileSync(join(root,'.zerotts-runtime/installed.json'),'utf8'));return installed.revision===ZEROTTS_REVISION&&existsSync(join(root,'.zerotts-venv/bin/python'));}catch{return false;}
}
type Connection={url:string;token:string};
let starting:Promise<Connection>|undefined;
export async function ensureZeroWorker():Promise<Connection>{
 if(starting)return starting;
 starting=startWorker();try{return await starting;}finally{starting=undefined;}
}
async function startWorker():Promise<Connection>{
 if(process.env.VITEST)throw new Error('ZeroTTS worker must be mocked in tests.');
 if(!zeroTtsInstalled())throw new Error('ZeroTTS chưa cài model. Chạy npm run zerotts:setup trong thư mục project rồi tải lại web.');
 const port=Number(process.env.ZEROTTS_PORT||7821);if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('ZEROTTS_PORT không hợp lệ.');
 const runtime=join(root,'.zerotts-runtime');mkdirSync(runtime,{recursive:true});
 const tokenFile=join(runtime,'worker-token');
 try{const fd=openSync(tokenFile,'wx',0o600);try{writeFileSync(fd,randomBytes(32).toString('hex'));}finally{closeSync(fd);}}catch(err:any){if(err.code!=='EEXIST')throw err;}
 const token=readFileSync(tokenFile,'utf8').trim();if(token.length<32)throw new Error('Token ZeroTTS local không hợp lệ.');
 const url=`http://127.0.0.1:${port}`;
 const health=async()=>{try{const {data}=await axios.get(url+'/health',{timeout:1200,proxy:false});return data.service==='lc-autogen-zerotts'&&data.ready===true&&data.revision===ZEROTTS_REVISION;}catch{return false;}};
 if(await health())return {url,token};
 const log=openSync(join(runtime,'worker.log'),'a',0o600);
 const child=spawn(join(root,'.zerotts-venv/bin/python'),['-u',join(root,'scripts/zerotts_worker.py'),'--port',String(port)],{cwd:root,env:{...process.env,LC_ZEROTTS_TOKEN:token},detached:true,stdio:['ignore',log,log]});
 closeSync(log);child.unref();let spawnError=false;child.on('error',()=>{spawnError=true;});
 const deadline=Date.now()+120000;
 while(Date.now()<deadline){if(await health())return {url,token};if(spawnError)break;await new Promise(r=>setTimeout(r,500));}
 throw new Error('ZeroTTS chưa khởi động được. Kiểm tra .zerotts-runtime/worker.log; web không tự đổi sang giọng khác.');
}
/** Local Python SDK bridge; narration never leaves the computer. */
export class ZeroTtsClient implements TtsClient {
 constructor(private opts:{voice:string;connect?:()=>Promise<Connection>}){}
 async generate(text:string,out:string){
  if(!ZERO_VOICES.some(v=>v.id===this.opts.voice))throw new Error('Chọn giọng ZeroTTS hợp lệ.');
  if(!text.trim()||text.length>8000)throw new Error('ZeroTTS cần 1–8000 ký tự cho mỗi cảnh.');
  const {url,token}=await(this.opts.connect||ensureZeroWorker)();const wav=out+'.zerotts.wav';
  try{
   const response=await axios.post(url+'/synthesize',{text,voice:this.opts.voice},{headers:{Authorization:'Bearer '+token},responseType:'arraybuffer',timeout:300000,maxContentLength:40*1024*1024,proxy:false});
   const bytes=Buffer.from(response.data);if(bytes.subarray(0,4).toString()!=='RIFF'||bytes.subarray(8,12).toString()!=='WAVE')throw new Error('ZeroTTS trả về audio không hợp lệ.');
   await writeFile(wav,bytes);await exec('ffmpeg',['-v','error','-y','-i',wav,'-c:a','libmp3lame','-b:a','192k',out]);
  }catch(err:any){
   if(axios.isAxiosError(err))throw new Error('ZeroTTS local không tạo được audio'+(err.response?' (HTTP '+err.response.status+')':'')+'. Hãy thử lại hoặc nghe thử giọng khác.');
   throw err;
  }finally{await rm(wav,{force:true});}
 }
}
