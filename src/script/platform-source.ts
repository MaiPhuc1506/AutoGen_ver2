import {publicGet,publicUrl,type PublicGet} from '../ingest/public-http.js';
import {parseRssFeed,cleanText,extractTag,normalizeUrl} from '../ingest/feed-collector.js';
import {parseTelegramPosts} from '../ingest/radar.js';
import type {SourceContent} from './types.js';

export class SourceAccessError extends Error {constructor(message:string,public status=422){super(message);}}
export interface PlatformSource extends SourceContent {sourceScope?:string;}
export async function fetchPlatformSource(input:string,options:{get?:PublicGet;env?:NodeJS.ProcessEnv;readArticle?:(url:string)=>Promise<SourceContent>}={}):Promise<PlatformSource|undefined>{
 const u=new URL(publicUrl(input)),host=u.hostname.replace(/^www\./,''),get=options.get||publicGet,env=options.env||process.env;
 const result=(title:string,content:string,scope:string):PlatformSource=>{
  if(!content.trim())throw new SourceAccessError('Nguồn không cung cấp nội dung công khai để nhập.');
  return {title,content,url:input,domain:host,ogImage:null,sourceScope:scope};
 };
 if(host==='news.ycombinator.com'){
  const id=u.searchParams.get('id');if(!id||!/^\d+$/.test(id))throw new SourceAccessError('Cần link bài Hacker News dạng item?id=…');
  const item=await get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
  if(!item||item.deleted||item.dead||item.type!=='story')throw new SourceAccessError('Bài Hacker News không tồn tại hoặc đã bị gỡ.');
  const text=cleanText(item.text||'');
  if(!text&&item.url){
   const link=publicUrl(item.url);
   if(options.readArticle){const article=await options.readArticle(link);return {...article,sourceScope:`Bài gốc từ ${link}, được liên kết bởi Hacker News; không bao gồm bình luận HN.`};}
   throw new SourceAccessError(`Bài Hacker News chỉ chứa liên kết. Hãy nhập bài gốc: ${link}`);
  }
  return result(cleanText(item.title),text,'Nội dung bài đăng Hacker News công khai; chưa bao gồm bình luận.');
 }
 if(host==='arxiv.org'||host==='export.arxiv.org'){
  const id=u.pathname.match(/^\/(?:abs|pdf|html)\/((?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?)(?:\.pdf)?$/i)?.[1];
  if(!id)throw new SourceAccessError('Cần URL một bài arXiv /abs/ID hoặc /pdf/ID.');
  const xml=String(await get(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`));
  const entry=xml.match(/<entry\b[\s\S]*?<\/entry>/i)?.[0];
  if(!entry)throw new SourceAccessError('Không tìm thấy abstract arXiv.');
  const title=cleanText(extractTag(entry,'title')),summary=cleanText(extractTag(entry,'summary'));
  if(title==='Error'||!summary)throw new SourceAccessError('arXiv không trả abstract hợp lệ.');
  return result(title,`${title}\n\n${summary}`,'Abstract và metadata arXiv; chưa đọc toàn văn PDF hay kiểm chứng nghiên cứu.');
 }
 if(host==='huggingface.co'){
  const parts=u.pathname.split('/').filter(Boolean);
  if(parts[0]==='papers'&&/^\d{4}\.\d{4,5}$/.test(parts[1]||''))return fetchPlatformSource(`https://arxiv.org/abs/${parts[1]}`,options);
  const kind=['spaces','datasets'].includes(parts[0])?parts.shift():undefined;
  if(parts.length===2&&!['blog','docs','collections','organizations'].includes(parts[0])){
   if(parts.some(p=>! /^[\w.-]+$/.test(p)))throw new SourceAccessError('Tên repository Hugging Face không hợp lệ.');
   const id=parts.join('/'),path=(kind?`${kind}/`:'')+id;
   const text=await get(`https://huggingface.co/${path}/raw/main/README.md`);
   if(typeof text!=='string'||/^\s*</.test(text))throw new SourceAccessError('Repo không có README công khai.');
   return result(id,text,'README/model card công khai; chưa tải hoặc chạy model/dataset/Space.');
  }
  // Blog articles use the existing HTML article extractor below.
 }
 if(host==='reddit.com'||host==='old.reddit.com'||host==='np.reddit.com'){
  const match=u.pathname.match(/^\/r\/([\w]+)\/comments\/([a-z0-9]+)(?:\/[^/]+)?\/?$/i);
  if(!match)throw new SourceAccessError('Cần liên kết bài đăng Reddit công khai /r/…/comments/…; không hỗ trợ trang riêng tư hay shortlink.');
  const path=`/r/${match[1]}/comments/${match[2]}`;
  if(env.REDDIT_ACCESS_TOKEN){
   const data=await get(`https://oauth.reddit.com${path}?limit=0`,{Authorization:`Bearer ${env.REDDIT_ACCESS_TOKEN}`});
   const post=data?.[0]?.data?.children?.[0]?.data;
   if(!post||post.removed_by_category||post.selftext==='[removed]'||post.selftext==='[deleted]')throw new SourceAccessError('Bài Reddit đã bị gỡ hoặc không có quyền truy cập.');
   if(!post.selftext)throw new SourceAccessError(`Bài Reddit chỉ có liên kết; nhập URL bài gốc: ${post.url||''}`);
   return result(post.title,cleanText(post.selftext),'Bài đăng Reddit qua OAuth; chưa lấy bình luận.');
  }
  const xml=String(await get(`https://www.reddit.com${path}/.rss`));
  if(!/<feed\b/.test(xml))throw new SourceAccessError('Reddit không cho phép đọc RSS công khai. Cần REDDIT_ACCESS_TOKEN được cấp hợp lệ.');
  const post=parseRssFeed(xml).find(p=>p.link.includes(`/comments/${match[2]}/`)||p.link.endsWith(`/comments/${match[2]}`));
  if(!post?.description||post.description.length<80)throw new SourceAccessError('RSS Reddit không có đủ nội dung bài đăng; cần quyền API hoặc nhập bài gốc.');
  return result(post.title,post.description,'RSS bài Reddit công khai, có thể chỉ là trích đoạn; chưa bao gồm toàn bộ thảo luận.');
 }
 if(host==='producthunt.com'){
  if(!/^\/(?:posts|products)\/[\w-]+\/?$/.test(u.pathname))throw new SourceAccessError('Cần link sản phẩm Product Hunt /posts/… hoặc /products/…');
  try{
   const feed=parseRssFeed(String(await get('https://www.producthunt.com/feed')));
   const post=feed.find(p=>normalizeUrl(p.link)===normalizeUrl(input));
   if(post?.description)return result(post.title,post.description,'Mô tả trong RSS Product Hunt công khai; chưa đọc review hoặc chạy công cụ.');
  }catch{/* Public HTML is allowed when a post has aged out of the feed. */}
 }
 if(host==='x.com'||host==='twitter.com'||host==='mobile.twitter.com'){
  const id=u.pathname.match(/^\/(?:[\w]+|i)\/status\/(\d+)\/?$/)?.[1];
  if(!id)throw new SourceAccessError('Cần liên kết một bài đăng X /status/…');
  if(!env.X_BEARER_TOKEN)throw new SourceAccessError('X cần X_BEARER_TOKEN có quyền đọc API. Không dùng scraper hoặc vượt giới hạn truy cập.');
  const data=await get(`https://api.x.com/2/tweets/${id}?tweet.fields=created_at`,{Authorization:`Bearer ${env.X_BEARER_TOKEN}`});
  if(!data.data?.text)throw new SourceAccessError('X không trả nội dung bài đăng; kiểm tra quyền API hoặc bài đã bị gỡ.');
  return result(cleanText(data.data.text).slice(0,180),data.data.text,'Nội dung bài đăng từ X API; chưa bao gồm thread hoặc nội dung liên kết.');
 }
 if(host==='t.me'||host==='telegram.me'){
  const match=u.pathname.match(/^\/(?:s\/)?([a-zA-Z][\w]{3,31})\/(\d+)\/?$/);
  if(!match)throw new SourceAccessError('Chỉ hỗ trợ URL một bài Telegram trong kênh công khai, không hỗ trợ t.me/c hoặc nhóm riêng tư.');
  const html=String(await get(`https://t.me/s/${match[1]}/${match[2]}`));
  const post=parseTelegramPosts(html).find(p=>p.link===`https://t.me/${match[1]}/${match[2]}`);
  if(!post)throw new SourceAccessError('Bài Telegram không có văn bản công khai hoặc kênh không cho phép xem public.');
  return result(post.title,post.description,'Bài Telegram trên trang công khai; chưa đọc nội dung ảnh/video hoặc nhóm riêng tư.');
 }
 return undefined;
}
