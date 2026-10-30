import { mkdir, rename, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
/** Small original synthesized effects; no downloads, API calls or licensed samples. */
export async function ensureEditorialSfx(dir: string) {
  await mkdir(dir, { recursive: true });
  const specs = {
    whoosh: ['anoisesrc=color=pink:amplitude=0.35:duration=0.18:sample_rate=44100:seed=73', 'highpass=f=800,lowpass=f=6500,afade=t=in:d=0.025,afade=t=out:st=0.04:d=0.14'],
    tick: ['sine=frequency=760:duration=0.09:sample_rate=44100', 'afade=t=out:st=0:d=0.09,volume=0.4'],
  };
  const files: Record<string,string> = {};
  for (const [name,[source,filter]] of Object.entries(specs)) {
    const out = join(dir,name+'.mp3');
    if (!existsSync(out)) {
      const tmp = join(dir,name+'.'+randomUUID()+'.mp3');
      try {
        await exec('ffmpeg',['-v','error','-y','-f','lavfi','-i',source,'-af',filter,'-c:a','libmp3lame','-b:a','128k',tmp]);
        await rename(tmp,out);
      } finally { await rm(tmp,{force:true}); }
    }
    files[name]=out;
  }
  return files;
}
