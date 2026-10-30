import {describe,it,expect,vi} from 'vitest';
import {createRadar,filterRadar,deduplicateRadar,type RadarItem,type RadarSource} from './radar.js';
import {parseRssFeed,normalizeUrl} from './feed-collector.js';
import {publicUrl,isPrivateAddress} from './public-http.js';
const src=(id:string):RadarSource=>({id,name:id,url:`https://${id}.example/feed`,kind:'rss',category:'news'});
const xml=(title='AI release',link='https://news.example/item')=>`<rss><channel><item><title>${title}</title><link>${link}</link><pubDate>2026-10-29T10:00:00Z</pubDate><description>AI model release details</description></item></channel></rss>`;
describe('AI News Radar',()=>{
 it('shares in-flight requests, caches failures too, and recovers after TTL',async()=>{
  let clock=Date.parse('2026-10-30T00:00:00Z');
  const get=vi.fn(async(url:string)=>{if(url.includes('blocked'))throw Error('Access restricted');return xml();});
  const radar=createRadar({sources:()=>[src('news'),src('blocked')],get,now:()=>clock});
  const [a,b]=await Promise.all([radar.snapshot(),radar.snapshot()]);
  expect(a).toBe(b);expect(get).toHaveBeenCalledTimes(2);expect(a.sources[1].state).toBe('error');expect(a.items).toHaveLength(1);
  await radar.snapshot();expect(get).toHaveBeenCalledTimes(2);clock+=300001;await radar.snapshot();expect(get).toHaveBeenCalledTimes(4);
 });
 it('deduplicates tracked URLs and titles across sources and filters by secondary source',async()=>{
  const radar=createRadar({sources:()=>[src('one'),src('two')],get:async url=>xml('AI release',`https://news.example/item?utm_source=${url.includes('one')?'one':'two'}#top`)});
  const data=await radar.snapshot();expect(data.duplicatesRemoved).toBe(1);expect(data.items[0].sourceIds).toEqual(['one','two']);expect(filterRadar(data,{source:'two'}).items).toHaveLength(1);
  expect(normalizeUrl('https://a.com/path/?b=2&a=1#x')).toBe('https://a.com/path?a=1&b=2');
 });
 it('filters unrelated articles and omits unavailable integrations without requests',async()=>{
  const get=vi.fn(async()=>xml('Phone review','https://news.example/phone').replace('AI model release details','Camera and battery review'));
  const radar=createRadar({sources:()=>[{...src('tech'),aiOnly:true},{...src('x'),unavailable:'API access needed'}],get});
  const data=await radar.snapshot();expect(data.items).toHaveLength(0);expect(get).toHaveBeenCalledTimes(1);expect(data.sources[1].state).toBe('unavailable');
 });
 it('distinguishes invalid feeds from a valid empty feed',async()=>{
  const radar=createRadar({sources:()=>[src('challenge'),src('empty')],get:async url=>url.includes('empty')?'<rss><channel></channel></rss>':'<html>Sign in</html>'});
  const data=await radar.snapshot();expect(data.sources.map(s=>s.state)).toEqual(['error','ok']);
 });
 it('uses actual popularity metrics and publication times without inventing dates',async()=>{
  const sources:RadarSource[]=[{...src('github'),kind:'github',category:'repos'},{...src('hf'),kind:'hf',category:'models'},{...src('hn'),kind:'hn'}];
  const get=vi.fn(async url=>url.includes('github')?{items:[{full_name:'lab/repo',html_url:'https://github.com/lab/repo',description:'AI repo',created_at:'2026-10-28',stargazers_count:42}]}:url.includes('hf')?[{id:'lab/model',likes:80,tags:['text-generation']}]:{hits:[{title:'AI release',url:'https://news.example/a',points:9,created_at:'2026-10-29'}]});
  const data=await createRadar({sources:()=>sources,get}).snapshot();
  expect(data.items.find(i=>i.sourceId==='hf')?.pubDate).toBeUndefined();
  expect(data.items.find(i=>i.sourceId==='github')?.signal?.value).toBe(42);
  expect(filterRadar(data,{category:'models'}).items).toHaveLength(1);expect(filterRadar(data,{q:'lab/'}).items).toHaveLength(2);
  expect(filterRadar(data,{sort:'newest'}).items[0].sourceId).toBe('hn');
  expect(get.mock.calls[0][0]).toContain('sort=stars');
 });
 it('orders real signals before RSS without a popularity metric',()=>{
  const base={id:'a',title:'AI',link:'https://news.example',sourceId:'one',sourceName:'one',sourceIds:['one'],alsoSeenOn:['one'],category:'news',description:'',duplicateCount:0} as RadarItem;
  const items=deduplicateRadar([{...base,title:'RSS',pubDate:'2026-10-30'},{...base,id:'b',title:'Scored',link:'https://news.example/b',pubDate:'2026-10-29',signal:{label:'HN points',value:10}}]);
  const data={items,sources:[],fetchedAt:'2026-10-30',duplicatesRemoved:0};expect(filterRadar(data,{sort:'trending'},Date.parse('2026-10-30')).items[0].id).toBe('b');
 });
 it('reads Atom alternate HTML links and rejects executable feed URLs',()=>{
  const items=parseRssFeed(`<feed><entry><title>Model</title><link rel="self" href="https://example.com/api"/><link rel="alternate" href="https://example.com/post?a=1&amp;b=2"/><summary>New model</summary></entry><entry><title>Bad</title><link>javascript:alert(1)</link></entry></feed>`);
  expect(items).toHaveLength(1);expect(items[0].link).toBe('https://example.com/post?a=1&b=2');
 });
 it('rejects private, credential-bearing and non-http import targets',()=>{
  for(const url of ['http://localhost','http://127.1','http://2130706433','http://[::1]','http://[::ffff:127.0.0.1]','http://10.0.0.1','https://u:p@example.com','file:///tmp/secret','http://service.internal'])expect(()=>publicUrl(url)).toThrow();
  expect(isPrivateAddress('192.168.0.1')).toBe(true);expect(isPrivateAddress('8.8.8.8')).toBe(false);expect(publicUrl('https://example.com/news')).toContain('example.com');
 });
});

it('blocks redirects to private addresses and never forwards authenticated requests on redirect',async()=>{
 const nock=(await import('nock')).default;const {publicGet}=await import('./public-http.js');
 try{
  nock('https://public.example').get('/redirect').reply(302,undefined,{Location:'http://127.0.0.1/private'});
  await expect(publicGet('https://public.example/redirect')).rejects.toThrow(/Redirect|redirect|công khai/);
  nock('https://public.example').get('/auth').reply(302,undefined,{Location:'https://other.example/steal'});
  await expect(publicGet('https://public.example/auth',{Authorization:'Bearer test-token'})).rejects.toThrow();
 }finally{nock.cleanAll();}
});
