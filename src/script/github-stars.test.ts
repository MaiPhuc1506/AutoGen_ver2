import {it,expect,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import {fetchGithubStars,matchingGithubStars,formatGithubStars} from './github-stars.js';
import {ScriptSchema} from '../render/script-schema.js';
import {applyReferenceDefaults} from '../render/reference-design.js';
import {composeHtml} from '../render/html-composer.js';
it('gets exact stars including zero from the matching GitHub API repo, refusing fabricated or unavailable counts',async()=>{
 const get=vi.fn(async()=>({full_name:'owner/repo',stargazers_count:12345}));
 const stars=await fetchGithubStars('https://github.com/owner/repo',get);
 expect(stars?.count).toBe(12345);expect(stars?.repoUrl).toBe('https://github.com/owner/repo');expect(Date.parse(stars!.fetchedAt)).toBeGreaterThan(0);
 expect(get).toHaveBeenCalledWith('https://api.github.com/repos/owner/repo');
 expect((await fetchGithubStars('https://github.com/owner/repo',async()=>({full_name:'owner/repo',stargazers_count:0})))?.count).toBe(0);
 for(const data of [{full_name:'wrong/repo',stargazers_count:12000},{full_name:'owner/repo',stargazers_count:'12k'},{full_name:'owner/repo',stargazers_count:-1},{full_name:'owner/repo',stargazers_count:2.5}])expect(await fetchGithubStars('https://github.com/owner/repo',async()=>data)).toBeUndefined();
 expect(await fetchGithubStars('https://github.com/owner/repo',async()=>{throw Error('rate limited');})).toBeUndefined();
 get.mockClear();expect(await fetchGithubStars('http://127.0.0.1/repo',get)).toBeUndefined();expect(get).not.toHaveBeenCalled();
});
it('renders a deterministic star count first, scopes it to the source repo, and preserves legacy hooks',async()=>{
 const script=applyReferenceDefaults(ScriptSchema.parse(JSON.parse(await readFile('tests/fixtures/studio-explainer.json','utf8'))));
 script.metadata.source.url='https://github.com/owner/repo';script.metadata.githubStars={repoUrl:script.metadata.source.url,count:12345,fetchedAt:'2026-10-29T00:00:00Z'};
 const hook=script.scenes[0];if(hook.templateData.template==='hook')hook.templateData.hero={name:'Repo'};
 const args={script,sceneAudio:script.scenes.map(s=>({id:s.id,durationSec:5})),gapSec:0,bgImageRelPath:null,audioRelPath:'voice.mp3'};
 const html=composeHtml(args);expect(html).toContain('data-count="12345"');expect(html).toContain('data-star-step="12">12.3K');expect(html).toContain('data-block-id="stars" data-reveal-at="0.030"');expect(html).toContain('data-block-id="heading" data-reveal-at="1.050"');expect(html).toContain('SAO TRÊN GITHUB');expect(html).not.toContain('onUpdate:');
 script.metadata.githubStars.repoUrl='https://github.com/other/repo';expect(matchingGithubStars(script)).toBeUndefined();expect(composeHtml(args)).not.toContain('class="ref-github-stars"');
 script.metadata.githubStars.repoUrl=script.metadata.source.url;delete script.creative;delete script.templatePack;expect(composeHtml(args)).not.toContain('class="ref-github-stars"');
 expect(formatGithubStars(999)).toBe('999');expect(formatGithubStars(1200000)).toBe('1.2M');
});

it('speaks verified stars once before the hook and never invents a count',async()=>{
 const {applySpokenGithubHook}=await import('./github-stars.js');
 const {ScriptSchema}=await import('../render/script-schema.js');
 const {readFile}=await import('node:fs/promises');
 const s=ScriptSchema.parse(JSON.parse(await readFile('tests/fixtures/studio-director.json','utf8')));
 s.metadata.source.url='https://github.com/Gathin23/cleanyourtv';
 s.metadata.githubStars={repoUrl:s.metadata.source.url,count:15238,fetchedAt:'2026-10-29T00:00:00.000Z'};
 applySpokenGithubHook(s);const text=s.scenes[0].voiceText;
 expect(text).toMatch(/^cleanyourtv có khoảng 15,2 nghìn sao trên GitHub\./);
 applySpokenGithubHook(s);expect(s.scenes[0].voiceText).toBe(text);
 const other=structuredClone(s);other.scenes[0].voiceText='Lợi ích thật.';other.metadata.source.url='https://github.com/other/repo';
 applySpokenGithubHook(other);expect(other.scenes[0].voiceText).toBe('Repo repo trên GitHub. Lợi ích thật.');
 expect(other.scenes[0].githubStarLeadIn).toBe(false);
});

it('introduces the source repo even without stars, never a name invented in the hero',async()=>{
 const {applySpokenGithubHook}=await import('./github-stars.js');
 const s=ScriptSchema.parse(JSON.parse(await readFile('tests/fixtures/studio-director.json','utf8')));
 s.metadata.source.url='https://github.com/owner/Actual.Name.git';delete s.metadata.githubStars;
 s.scenes[0].voiceText='Gỡ quảng cáo mà không cần root.';
 if(s.scenes[0].templateData.template==='hook')s.scenes[0].templateData.hero={name:'Invented'};
 applySpokenGithubHook(s);
 expect(s.scenes[0].voiceText).toBe('Repo Actual.Name trên GitHub. Gỡ quảng cáo mà không cần root.');
 applySpokenGithubHook(s);
 expect(s.scenes[0].voiceText.match(/Actual\.Name/g)).toHaveLength(1);
});

it('upgrades old count-only hooks and keeps the benefit without repeating a leading name',async()=>{
 const {applySpokenGithubHook}=await import('./github-stars.js');
 const s=ScriptSchema.parse(JSON.parse(await readFile('tests/fixtures/studio-director.json','utf8')));
 s.metadata.source.url='https://github.com/owner/cleanyourtv';
 s.metadata.githubStars={repoUrl:s.metadata.source.url,count:15238,fetchedAt:'2026-10-29T00:00:00Z'};
 for(const body of ['cleanyourtv giúp gỡ quảng cáo mà không cần root.','Đây là repo cleanyourtv. Gỡ quảng cáo mà không cần root.']){
  s.scenes[0].githubStarSpokenPrefix='Khoảng 15,2 nghìn sao trên GitHub.';
  s.scenes[0].voiceText=s.scenes[0].githubStarSpokenPrefix+' '+body;
  applySpokenGithubHook(s);
  expect(s.scenes[0].voiceText).toBe('cleanyourtv có khoảng 15,2 nghìn sao trên GitHub. Gỡ quảng cáo mà không cần root.');
 }
 delete s.metadata.githubStars;
 applySpokenGithubHook(s);
 expect(s.scenes[0].voiceText).toBe('Repo cleanyourtv trên GitHub. Gỡ quảng cáo mà không cần root.');
});

it('leaves uploaded narration and non-repository sources intact',async()=>{
 const {applySpokenGithubHook}=await import('./github-stars.js');
 const s=ScriptSchema.parse(JSON.parse(await readFile('tests/fixtures/studio-director.json','utf8')));
 const original=s.scenes[0].voiceText;
 s.metadata.source.url='https://example.com/article';applySpokenGithubHook(s);
 expect(s.scenes[0].voiceText).toBe(original);
 s.metadata.source.url='https://github.com/owner/repo';s.voice.uploadId='c676d868-a92c-49d1-8dfc-5dab07cb1f5f';
 applySpokenGithubHook(s);expect(s.scenes[0].voiceText).toBe(original);
});
