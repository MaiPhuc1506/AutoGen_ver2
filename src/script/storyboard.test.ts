import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {ScriptSchema} from '../render/script-schema.js';
import {reviewStoryboard} from './storyboard.js';
import {composeHtml} from '../render/html-composer.js';
import {fetchGithubContext} from './github-context.js';
import {buildUserPrompt} from './prompts/user-prompt.js';
const fixture=()=>JSON.parse(readFileSync('tests/fixtures/studio-dynamic.json','utf8'));
it('permits variable scene counts only in explicit auto mode and retains legacy limits',()=>{
 const s=fixture();s.scenes=[s.scenes[0],s.scenes.at(-1)];expect(ScriptSchema.safeParse(s).success).toBe(false);
 s.directingMode='auto';expect(ScriptSchema.safeParse(s).success).toBe(true);
 s.scenes=Array.from({length:24},(_,i)=>({...s.scenes[i===23?1:0],id:'s'+i,type:i===0?'hook':i===23?'outro':'body'}));expect(ScriptSchema.safeParse(s).success).toBe(true);
 s.scenes.splice(1,0,{...s.scenes[0],id:'extra'});expect(ScriptSchema.safeParse(s).success).toBe(false);
});
it('requires storyboard and flags unsupported evidence while rendering escaped illustrations across packs',()=>{
 const raw=fixture();raw.directingMode='auto';const s=ScriptSchema.parse(raw);
 expect(()=>reviewStoryboard(s,'Real quote')).toThrow(/thiếu storyboard/);
 s.scenes.forEach(scene=>scene.storyboard={intent:'Giải thích luồng',visualBrief:'Dữ liệu đi qua xử lý',basis:'conceptual',evidence:'Real quote',transitionReason:'Theo luồng dữ liệu'});
 s.scenes[1].templateData={template:'data-flow',title:'Luồng xử lý',nodes:[{label:'Input',detail:'Text'},{label:'Output',detail:'Audio'}]};
 s.scenes[2].templateData={template:'worked-example',title:'Ví dụ',input:'<script>bad()</script>',operation:'Xử lý',output:'Kết quả minh họa',basis:'conceptual'};
 s.scenes[3].templateData={template:'code-window',title:'Code',language:'js',code:'unknown()',highlightLines:[1]};
 reviewStoryboard(s,'Real quote');expect(s.scenes[0].storyboard?.status).toBe('source-matched');expect(s.scenes[3].storyboard?.status).toBe('needs-review');
 for(const pack of ['hud','flat-vector','editorial'] as const){
  s.templatePack=pack;const html=composeHtml({script:s,sceneAudio:s.scenes.map(a=>({id:a.id,durationSec:4})),gapSec:0,outroHoldSec:0,bgImageRelPath:null,audioRelPath:'voice.mp3'});
  expect(html).toContain('semantic-link');expect(html).toContain('code-highlight');expect(html).toContain('MINH HỌA KHÁI NIỆM');expect(html).toContain('&lt;script&gt;bad()&lt;/script&gt;');expect(html).not.toContain('<script>bad()');
 }
});
it('reads only bounded same-repo docs/examples and explicitly reports partial source scope',async()=>{
 const calls:string[]=[];const encode=(text:string)=>({encoding:'base64',content:Buffer.from(text).toString('base64')});
 const source=await fetchGithubContext('https://github.com/a/b',async url=>{
  calls.push(url);
  if(url.endsWith('/readme'))return {...encode('# Project\nREADME.'),path:'README.md'};
  if(url.endsWith('/a/b'))return {default_branch:'trunk'};
  if(url.includes('/git/trees/'))return {tree:[{type:'blob',path:'docs/usage.md',size:40},{type:'blob',path:'examples/search.ts',size:40},{type:'blob',path:'.env',size:10},{type:'blob',path:'docs/../../secret.md',size:10},{type:'blob',path:'docs/huge.md',size:20000},{type:'blob',path:'src/main.ts',size:10}]};
  if(url.includes('docs/usage.md'))return encode('Usage: search("hello")');
  if(url.includes('examples/search.ts'))return encode('search("hello");');
  throw new Error('unexpected URL');
 });
 expect(source.sourceFiles).toEqual(['README.md','docs/usage.md','examples/search.ts']);expect(source.content).toContain('search("hello");');expect(source.sourceScope).toContain('chưa chạy repo');expect(calls.every(u=>u.startsWith('https://api.github.com/repos/a/b'))).toBe(true);expect(calls.some(u=>u.includes('secret'))).toBe(false);
 const prompt=buildUserPrompt(source,'review_60','DevPeek36',{contentMode:'overview',targetDurationSec:60,directingMode:'auto'});expect(prompt).toContain('không ép 5/6/8');expect(prompt).toContain('worked-example');
});
it('generates an auto draft with four scenes through the real validation pipeline using a fake LLM',async()=>{
 const {generateScript}=await import('./generator.js');const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const dir=await mkdtemp(join(tmpdir(),'director-generator-'));
 try{
  const raw=JSON.parse(readFileSync('tests/fixtures/studio-director.json','utf8'));delete raw.timeline;
  raw.coverage={items:['purpose','features','usage','requirements','limitations','examples'].map(topic=>({topic,status:'not-in-source',summary:'Nguồn kiểm thử tối giản',sceneIds:[]})),omittedTopics:[]};
  const result=await generateScript({input:'unused',source:{title:'Fixture',content:'Internal fixture',url:'manual',domain:'manual',ogImage:null},directingMode:'auto',contentMode:'overview',targetDurationSec:30,outputDir:dir,llmProvider:{name:'fake',generate:async()=>JSON.stringify(raw)}});
  expect(result.script.scenes).toHaveLength(4);expect(result.script.directingMode).toBe('auto');expect(result.script.metadata.channel).toBe('DevPeek36');
 }finally{await rm(dir,{recursive:true,force:true});}
});

it('requires a source-grounded opening walkthrough in new GitHub drafts and rejects repeated examples',async()=>{
 const {validatePracticalExamples}=await import('./storyboard.js');
 const s=ScriptSchema.parse(fixture());s.directingMode='auto';s.explanationLevel='quick';
 const url='https://github.com/a/b';
 expect(()=>validatePracticalExamples(s,url)).toThrow(/Ngay sau hook/);
 expect(()=>validatePracticalExamples(s,'manual')).not.toThrow();
 s.scenes[1].templateData={template:'worked-example',title:'Hỏi tài liệu',input:'Tài liệu vật lý và câu hỏi',operation:'Tìm thông tin trong tài liệu',output:'Giải thích kèm dẫn nguồn',basis:'conceptual'};
 s.scenes[1].storyboard={intent:'Ví dụ',visualBrief:'Ba bước',basis:'conceptual',evidence:'Real quote',transitionReason:'Cách dùng'};
 expect(()=>validatePracticalExamples(s,url)).toThrow(/evidence/);
 s.scenes[1].storyboard.status='source-matched';
 expect(()=>validatePracticalExamples(s,url)).not.toThrow();
 s.explanationLevel='standard';expect(()=>validatePracticalExamples(s,url)).toThrow(/ưu tiên 2/);
 s.coverage={items:[],omittedTopics:['Thiếu ví dụ khác trong nguồn; ưu tiên thời lượng cho điều kiện dùng.']};
 expect(()=>validatePracticalExamples(s,url)).not.toThrow();
 s.scenes[2].templateData={...s.scenes[1].templateData};s.scenes[2].storyboard={...s.scenes[1].storyboard};
 expect(()=>validatePracticalExamples(s,url)).toThrow(/lặp đầu vào/);
 s.scenes[2].templateData={...s.scenes[1].templateData,input:'Dữ liệu'};
 expect(()=>validatePracticalExamples(s,url)).toThrow(/chung chung/);
 delete s.explanationLevel;expect(()=>validatePracticalExamples(s,url)).not.toThrow();
});

it('moves an existing example after the hook before measuring, preserving scene IDs',async()=>{
 const {prioritizePracticalExample}=await import('./storyboard.js');
 const s=ScriptSchema.parse(fixture());s.directingMode='auto';s.explanationLevel='standard';
 const id=s.scenes[2].id;
 s.scenes[2].templateData={template:'worked-example',title:'Ví dụ',input:'Câu hỏi về PDF',operation:'Tìm dẫn chứng',output:'Giải thích có trích dẫn',basis:'conceptual'};
 prioritizePracticalExample(s,'https://github.com/a/b');
 expect(s.scenes[1].id).toBe(id);expect(new Set(s.scenes.map(s=>s.id)).size).toBe(s.scenes.length);
});

it('matches Markdown code formatting in evidence without accepting invented words',()=>{
 const s=ScriptSchema.parse(fixture());s.directingMode='auto';
 for(const scene of s.scenes)scene.storyboard={intent:'Cách dùng',visualBrief:'Lệnh nguồn',basis:'source-example',evidence:'pip install tool installs the CLI',transitionReason:'Tiếp tục'};
 reviewStoryboard(s,'`pip install tool` installs the CLI');expect(s.scenes[1].storyboard?.status).toBe('source-matched');
 reviewStoryboard(s,'`pip install tool` installs only the core');expect(s.scenes[1].storyboard?.status).toBe('needs-review');
});
