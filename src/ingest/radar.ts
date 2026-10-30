import {createHash} from 'node:crypto';
import pLimit from 'p-limit';
import {parseRssFeed,normalizeUrl,cleanText,loadFeedsConfig} from './feed-collector.js';
import {publicGet,publicUrl,accessMessage,type PublicGet} from './public-http.js';

export const RADAR_CATEGORIES=['news','repos','tools','models','research'] as const;
export type RadarCategory=typeof RADAR_CATEGORIES[number];
export interface RadarSource {id:string;name:string;url:string;category:RadarCategory;kind:'rss'|'github'|'hf'|'hn'|'reddit'|'x'|'telegram';aiOnly?:boolean;unavailable?:string;}
export interface RadarItem {id:string;title:string;link:string;sourceId:string;sourceName:string;sourceIds:string[];alsoSeenOn:string[];category:RadarCategory;pubDate?:string;description:string;signal?:{label:string;value:number};duplicateCount:number;}
export interface RadarStatus {id:string;name:string;state:'ok'|'error'|'unavailable';count:number;message?:string;}
export interface RadarSnapshot {items:RadarItem[];sources:RadarStatus[];fetchedAt:string;duplicatesRemoved:number;}
const aiPattern=/(?:\b(?:AI|LLM|GPT|OpenAI|Anthropic|Gemini|Claude|DeepSeek|Llama|Mistral|Qwen|RAG|agentic|diffusion|transformers?)\b|artificial intelligence|machine learning|deep learning|neural network|trí tuệ nhân tạo|mô hình ngôn ngữ)/iu;
export const isAiContent=(title:string,description='')=>aiPattern.test(`${title} ${description}`);
export function radarSources(env:NodeJS.ProcessEnv=process.env):RadarSource[]{
 const existing=loadFeedsConfig().filter(s=>s.enabled).map(s=>({id:s.id,name:s.name,url:s.url,kind:'rss' as const,category:'news' as const,aiOnly:true}));
 return [...existing,
 {id:'dantri',name:'Dân Trí · Công nghệ',url:'https://dantri.com.vn/rss/suc-manh-so.rss',kind:'rss',category:'news',aiOnly:true},
 {id:'techcrunch',name:'TechCrunch · AI',url:'https://techcrunch.com/category/artificial-intelligence/feed/',kind:'rss',category:'news'},
 {id:'openai',name:'OpenAI Blog',url:'https://openai.com/news/rss.xml',kind:'rss',category:'news'},
 {id:'google-ai',name:'Google AI Blog',url:'https://blog.google/technology/ai/rss/',kind:'rss',category:'news'},
 {id:'hf-blog',name:'Hugging Face Blog',url:'https://huggingface.co/blog/feed.xml',kind:'rss',category:'news'},
 {id:'arxiv',name:'arXiv · AI / ML / NLP',url:'https://rss.arxiv.org/rss/cs.AI+cs.LG+cs.CL',kind:'rss',category:'research'},
 {id:'producthunt',name:'Product Hunt',url:'https://www.producthunt.com/feed',kind:'rss',category:'tools',aiOnly:true},
 {id:'github',name:'GitHub · AI repositories',url:'https://api.github.com/search/repositories',kind:'github',category:'repos'},
 {id:'hf-models',name:'Hugging Face · Models',url:'https://huggingface.co/api/models',kind:'hf',category:'models'},
 {id:'hf-spaces',name:'Hugging Face · Spaces / Tools',url:'https://huggingface.co/api/spaces',kind:'hf',category:'tools'},
 {id:'hackernews',name:'Hacker News',url:'https://hn.algolia.com/api/v1/search_by_date?tags=story&query=AI&hitsPerPage=50',kind:'hn',category:'news'},
 {id:'reddit',name:'Reddit · MachineLearning',url:env.REDDIT_ACCESS_TOKEN?'https://oauth.reddit.com/r/MachineLearning/new?limit=30':'https://www.reddit.com/r/MachineLearning/new/.rss?limit=30',kind:'reddit',category:'research'},
 {id:'x',name:'X · AI news',url:'https://api.x.com/2/tweets/search/recent',kind:'x',category:'news',unavailable:env.X_BEARER_TOKEN?undefined:'Cần X_BEARER_TOKEN có quyền đọc/search API. Không dùng scraper hoặc dữ liệu giả.'},
 ...((env.RADAR_TELEGRAM_CHANNELS||'').split(',').map(c=>c.trim()).filter(c=>/^[a-zA-Z][\w]{3,31}$/.test(c)).map(channel=>({id:`telegram-${channel.toLowerCase()}`,name:`Telegram · ${channel}`,url:`https://t.me/s/${channel}`,kind:'telegram' as const,category:'news' as const,aiOnly:true}))),
 ...(!env.RADAR_TELEGRAM_CHANNELS?[{id:'telegram',name:'Telegram',url:'https://t.me/',kind:'telegram' as const,category:'news' as const,unavailable:'Chưa chọn kênh công khai. Đặt RADAR_TELEGRAM_CHANNELS trong .env.local; chỉ đọc trang public.'}]:[]),
 ];
}
function iso(value:unknown):string|undefined {const n=typeof value==='number'?value:Date.parse(String(value||''));return Number.isFinite(n)&&n>0?new Date(n).toISOString():undefined;}
function makeItem(src:RadarSource,raw:{title:unknown;link:unknown;description?:unknown;date?:unknown;signal?:RadarItem['signal']}):RadarItem|undefined {
 const title=cleanText(String(raw.title||'')).slice(0,300),description=cleanText(String(raw.description||'')).slice(0,700);
 if(!title||src.aiOnly&&!isAiContent(title,description))return;
 let link:string;try{link=publicUrl(String(raw.link));}catch{return;}
 return {id:createHash('sha256').update(normalizeUrl(link)).digest('hex').slice(0,16),title,link,sourceId:src.id,sourceName:src.name,sourceIds:[src.id],alsoSeenOn:[src.name],category:src.category,pubDate:iso(raw.date),description,signal:raw.signal,duplicateCount:0};
}
export function parseTelegramPosts(html:string):{title:string;link:string;description:string;date?:string}[]{
 const blocks=html.split(/<div\b[^>]*class="[^"]*tgme_widget_message_wrap[^\"]*"[^>]*>/i).slice(1);
 return blocks.map(block=>{
  const text=cleanText(block.match(/<div\b[^>]*class="[^"]*tgme_widget_message_text[^\"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1]||'');
  const path=block.match(/data-post="([\w]+\/\d+)"/)?.[1];
  return {title:text.slice(0,180),description:text,link:path?`https://t.me/${path}`:'',date:block.match(/<time[^>]*datetime="([^"]+)"/)?.[1]};
 }).filter(p=>p.title&&p.link);
}
async function collect(src:RadarSource,get:PublicGet,env:NodeJS.ProcessEnv,now:number):Promise<RadarItem[]>{
 let raw:any[]=[];
 if(src.kind==='github'){
  const since=new Date(now-30*86400000).toISOString().slice(0,10);
  const q=`topic:artificial-intelligence stars:>10 pushed:>=${since} archived:false`;
  const data=await get(`${src.url}?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=40`,env.RADAR_GITHUB_TOKEN?{Authorization:`Bearer ${env.RADAR_GITHUB_TOKEN}`} : undefined);
  if(!Array.isArray(data.items))throw new Error('GitHub trả dữ liệu không hợp lệ.');
  raw=data.items.map((r:any)=>({title:r.full_name,link:r.html_url,description:r.description,date:r.created_at,signal:{label:'stars · repos hoạt động 30 ngày',value:r.stargazers_count}}));
 }else if(src.kind==='hf'){
  const data=await get(src.url+'?sort=trendingScore&direction=-1&limit=40');
  if(!Array.isArray(data))throw new Error('Hugging Face trả dữ liệu không hợp lệ.');
  raw=data.map((r:any)=>({title:r.id,link:`https://huggingface.co/${src.id==='hf-spaces'?'spaces/':''}${r.id}`,description:[r.pipeline_tag,...(r.tags||[]).slice(0,6)].filter(Boolean).join(' · '),date:r.createdAt,signal:{label:'likes · danh sách HF trending',value:r.likes}}));
 }else if(src.kind==='hn'){
  const data=await get(src.url);if(!Array.isArray(data.hits))throw new Error('Hacker News trả dữ liệu không hợp lệ.');
  raw=data.hits.filter((r:any)=>isAiContent(r.title||'',r.story_text||'')).map((r:any)=>({title:r.title,link:r.url||`https://news.ycombinator.com/item?id=${r.objectID}`,description:r.story_text||'',date:r.created_at,signal:{label:'HN points',value:r.points}}));
 }else if(src.kind==='x'){
  const data=await get(src.url+'?query='+encodeURIComponent('(AI OR LLM OR OpenAI OR Anthropic) -is:retweet lang:en')+'&max_results=20&tweet.fields=created_at,public_metrics',{Authorization:`Bearer ${env.X_BEARER_TOKEN}`});
  if(data.errors?.length)throw new Error('X API không trả được toàn bộ nội dung; kiểm tra quyền và quota.');
  raw=(data.data||[]).map((r:any)=>({title:r.text,link:`https://x.com/i/status/${r.id}`,description:r.text,date:r.created_at,signal:{label:'X likes',value:r.public_metrics?.like_count}}));
 }else if(src.kind==='reddit'&&env.REDDIT_ACCESS_TOKEN){
  const data=await get(src.url,{Authorization:`Bearer ${env.REDDIT_ACCESS_TOKEN}`});
  if(!Array.isArray(data.data?.children))throw new Error('Reddit trả dữ liệu không hợp lệ.');
  raw=data.data.children.map(({data:r}:any)=>({title:r.title,link:`https://www.reddit.com${r.permalink}`,description:r.selftext,date:r.created_utc*1000,signal:{label:'Reddit score',value:r.score}}));
 }else{
  const data=await get(src.url);if(typeof data!=='string')throw new Error('Nguồn không trả RSS/Atom hoặc trang công khai hợp lệ.');
  if(src.kind==='telegram')raw=parseTelegramPosts(data);
  else{
   if(!/<(?:rss|feed|rdf:RDF)\b/i.test(data))throw new Error('Không đọc được RSS/Atom; nguồn có thể chặn truy cập.');
   raw=parseRssFeed(data,src.name).slice(0,60).map(r=>({title:r.title,link:r.link,description:r.description,date:r.pubDate}));
  }
 }
 return raw.map(r=>makeItem(src,{...r,signal:Number.isFinite(r.signal?.value)&&r.signal.value>=0?r.signal:undefined})).filter((r):r is RadarItem=>Boolean(r));
}
export function deduplicateRadar(items:RadarItem[]):RadarItem[]{
 const groups:RadarItem[]=[],byUrl=new Map<string,RadarItem>(),byTitle=new Map<string,RadarItem>();
 for(const item of items){
  const url=normalizeUrl(item.link),title=item.title.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
  const match=byUrl.get(url)||byTitle.get(title);
  if(match){match.duplicateCount++;match.sourceIds=[...new Set([...match.sourceIds,...item.sourceIds])];match.alsoSeenOn=[...new Set([...match.alsoSeenOn,...item.alsoSeenOn])];if(!match.description)match.description=item.description;if(!match.signal&&item.signal)match.signal=item.signal;byUrl.set(url,match);byTitle.set(title,match);}
  else{const fresh={...item,sourceIds:[...item.sourceIds],alsoSeenOn:[...item.alsoSeenOn]};groups.push(fresh);byUrl.set(url,fresh);byTitle.set(title,fresh);}
 }
 return groups;
}
export function filterRadar(snapshot:RadarSnapshot,options:{source?:string;category?:string;sort?:string;q?:string}={},now=Date.now()){
 let items=snapshot.items.filter(i=>(!options.source||i.sourceIds.includes(options.source))&&(!options.category||i.category===options.category)&&(!options.q||`${i.title} ${i.description}`.toLocaleLowerCase().includes(options.q.toLocaleLowerCase())));
 const date=(i:RadarItem)=>i.pubDate?Date.parse(i.pubDate):0;
 const score=(i:RadarItem)=>i.signal?Math.log10(1+i.signal.value)/(1+Math.max(0,now-date(i))/86400000/7):-1;
 items=items.sort(options.sort==='trending'?(a,b)=>score(b)-score(a)||date(b)-date(a):(a,b)=>date(b)-date(a));
 return {...snapshot,items,total:snapshot.items.length};
}
export function createRadar(options:{get?:PublicGet;now?:()=>number;sources?:()=>RadarSource[];env?:NodeJS.ProcessEnv;ttlMs?:number}={}){
 const get=options.get||publicGet,now=options.now||Date.now,env=options.env||process.env,ttl=options.ttlMs??5*60*1000;
 let cached:RadarSnapshot|undefined,pending:Promise<RadarSnapshot>|undefined;
 return {async snapshot():Promise<RadarSnapshot>{
  if(cached&&now()-Date.parse(cached.fetchedAt)<ttl)return cached;
  if(pending)return pending;
  pending=(async()=>{
   const sources=options.sources?.()||radarSources(env),limit=pLimit(4);
   const results=await Promise.all(sources.map(src=>limit(async()=>{
    if(src.unavailable)return {items:[],status:{id:src.id,name:src.name,state:'unavailable',count:0,message:src.unavailable} as RadarStatus};
    try{const items=await collect(src,get,env,now());return {items,status:{id:src.id,name:src.name,state:'ok',count:items.length} as RadarStatus};}
    catch(error){return {items:[],status:{id:src.id,name:src.name,state:'error',count:0,message:accessMessage(error)} as RadarStatus};}
   })));
   const all=results.flatMap(r=>r.items),items=deduplicateRadar(all);
   cached={items,sources:results.map(r=>r.status),fetchedAt:new Date(now()).toISOString(),duplicatesRemoved:all.length-items.length};return cached;
  })().finally(()=>{pending=undefined;});
  return pending;
 }};
}
