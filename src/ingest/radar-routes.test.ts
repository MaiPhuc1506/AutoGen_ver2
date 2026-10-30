import {beforeAll,afterAll,afterEach,it,expect} from 'vitest';
import nock from 'nock';
import type {Server} from 'node:http';
import {app} from '../server.js';
import {radarSources} from './radar.js';
let server:Server,base:string;
beforeAll(async()=>{
 nock.disableNetConnect();nock.enableNetConnect(/127\.0\.0\.1/);
 await new Promise<void>(resolve=>{server=app.listen(0,'127.0.0.1',()=>{const address=server.address();if(address&&typeof address==='object')base=`http://127.0.0.1:${address.port}`;resolve();});});
});
afterEach(()=>nock.cleanAll());afterAll(async()=>{nock.enableNetConnect();await new Promise<void>(r=>server.close(()=>r()));});
it('validates filters and returns real adapter results and per-source health through the existing server',async()=>{
 const invalid=await fetch(base+'/api/radar?sort=invented');expect(invalid.status).toBe(400);
 const hosts=[...new Set(radarSources().filter(s=>!s.unavailable).map(s=>new URL(s.url).origin))];
 for(const host of hosts)nock(host).persist().get(/.*/).reply(function(uri){
  if(uri.includes('/search/repositories'))return [200,{items:[{full_name:'lab/ai',html_url:'https://github.com/lab/ai',description:'AI project',stargazers_count:20,created_at:'2026-10-29'}]}];
  if(uri.startsWith('/api/models')||uri.startsWith('/api/spaces'))return [200,[]];
  if(host.includes('algolia'))return [200,{hits:[]}];
  return [200,'<rss><channel><item><title>AI model released</title><link>https://news.example/ai</link><description>Public RSS description</description></item></channel></rss>'];
 });
 const response=await fetch(base+'/api/radar?category=repos');expect(response.status).toBe(200);const data=await response.json();
 expect(data.items).toHaveLength(1);expect(data.items[0].link).toBe('https://github.com/lab/ai');expect(data.sources.some((s:any)=>s.id==='x')).toBe(true);expect(data.duplicatesRemoved).toBeGreaterThan(0);
});
it('imports an HF URL through /api/extract-url, retaining the actual README and scope',async()=>{
 nock('https://huggingface.co').get('/lab/model/raw/main/README.md').reply(200,'# Real model card\nUsage and documented limitations.');
 const response=await fetch(base+'/api/extract-url',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:'https://huggingface.co/lab/model'})});
 expect(response.status).toBe(200);const data=await response.json();expect(data.content).toContain('documented limitations');expect(data.url).toBe('https://huggingface.co/lab/model');expect(data.sourceScope).toContain('chưa tải');
});
it('rejects non-public targets and returns actionable source errors instead of title-only content',async()=>{
 for(const url of ['file:///tmp/secret','http://127.0.0.1:3000/','https://x.com/user/status/123']){
  const response=await fetch(base+'/api/extract-url',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});
  expect(response.status).toBeGreaterThanOrEqual(400);expect((await response.json()).error).toBeTruthy();
 }
});
