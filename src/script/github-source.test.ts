import {expect,it} from 'vitest';
import {fetchGithubReadme,readmeSource} from './github-source.js';
import {validateCoverage,COVERAGE_TOPICS} from './coverage.js';
import {readFile} from 'node:fs/promises';
import {ScriptSchema} from '../render/script-schema.js';
const markdown='# Project\n\nA useful tool.\nSecond sentence.\nThird sentence.\nFourth sentence.\n\n## Features\nFast local indexing.\n\n## Usage\n```sh\nnpm run index\n```\n\n## Requirements\nNode 22 is required.\n\n## Limitations\nNo private repositories.\n\n## Examples\nSearch a public repository.';
it('keeps later README sections and commands, supports the default branch via API, and refuses invented fallback',async()=>{
 const s=await fetchGithubReadme('https://github.com/owner/repo',async()=>({encoding:'base64',path:'docs/README.md',content:Buffer.from(markdown).toString('base64')}));
 expect(s.content).toContain('No private repositories.');expect(s.content).toContain('npm run index');expect(s.sections).toContain('Limitations');expect(s.title).not.toContain('AI');expect(s.sourceScope).toContain('chưa phân tích');
 await expect(fetchGithubReadme('https://github.com/a/b',async()=>{throw new Error('unavailable');})).rejects.toThrow(/README/);
 expect(readmeSource('https://github.com/a/b','a'.repeat(65000)+'## Limitations\nImportant end.').content).toContain('Important end.');
 expect(()=>readmeSource('https://localhost/a/b',markdown)).toThrow();
});
it('checks the six coverage categories, exact source evidence and real scene references',async()=>{
 const s=ScriptSchema.parse(JSON.parse(await readFile('tests/fixtures/studio-explainer.json','utf8')));
 s.coverage={items:COVERAGE_TOPICS.map(topic=>({topic,status:'covered',summary:'Có trong README',evidence:'A useful tool.',sceneIds:[s.scenes[0].id]})),omittedTopics:[]};
 expect(()=>validateCoverage(s,markdown)).not.toThrow();
 s.coverage.items[0].evidence='Fabricated feature';expect(()=>validateCoverage(s,markdown)).toThrow(/NGUYÊN VĂN/);
 s.coverage.items[0].evidence='A useful tool.';s.coverage.items[0].sceneIds=['missing'];expect(()=>validateCoverage(s,markdown)).toThrow(/không tồn tại/);
});
it('downgrades unsupported coverage annotations to visible review warnings without hiding them',async()=>{
 const {reviewCoverage}=await import('./coverage.js');
 const s=ScriptSchema.parse(JSON.parse(await readFile('tests/fixtures/studio-explainer.json','utf8')));
 s.coverage={items:COVERAGE_TOPICS.map(topic=>({topic,status:'covered',summary:'AI suggestion',evidence:'Not a real quote',sceneIds:['missing']})),omittedTopics:[]};
 reviewCoverage(s,markdown);expect(s.coverage.items.every(i=>i.status==='needs-review')).toBe(true);expect(s.coverage.warnings).toHaveLength(6);expect(()=>validateCoverage(s,markdown)).not.toThrow();
});
