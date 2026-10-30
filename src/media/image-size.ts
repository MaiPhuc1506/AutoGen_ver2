import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
export async function imageSize(path:string):Promise<{width:number;height:number}>{
 const {stdout}=await exec('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',path],{timeout:10000,maxBuffer:100000});
 const s=JSON.parse(stdout).streams?.[0];
 if(!s?.width||!s?.height)throw new Error('Ảnh không có kích thước hợp lệ.');
 return {width:s.width,height:s.height};
}
