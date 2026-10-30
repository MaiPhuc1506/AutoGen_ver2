import {it,expect,vi,afterEach} from 'vitest';
import nock from 'nock';
import {fetchPlatformSource} from './platform-source.js';
import {fetchSourceContent} from './source-fetcher.js';
afterEach(()=>nock.cleanAll());
it('imports HF model, dataset and Space READMEs without executing them',async()=>{
 for(const path of ['lab/model','datasets/lab/data','spaces/lab/demo']){
  const get=vi.fn(async()=> '# Model card\nPublic usage and limitations');
  const s=await fetchPlatformSource('https://huggingface.co/'+path,{get});
  expect(get).toHaveBeenCalledWith(`https://huggingface.co/${path}/raw/main/README.md`);expect(s?.content).toContain('limitations');
 }
});
it('reads only the arXiv abstract and explicitly reports its scope',async()=>{
 const get=vi.fn(async(_url:string)=>'<feed><entry><title>AI Paper</title><summary>Research abstract with limits</summary></entry></feed>');
 const s=await fetchPlatformSource('https://arxiv.org/pdf/2601.12345.pdf',{get});expect(s?.sourceScope).toContain('chưa đọc toàn văn');expect(s?.content).toContain('Research abstract');expect(get.mock.calls[0]?.[0]).toContain('id_list=2601.12345');
});
it('handles HN text stories and follows link stories through the existing article reader',async()=>{
 const s=await fetchPlatformSource('https://news.ycombinator.com/item?id=123',{get:async()=>({type:'story',title:'Ask HN: AI',text:'<p>Real post body</p>'})});expect(s?.content).toBe('Real post body');
 const readArticle=vi.fn(async()=>({title:'Original',content:'Actual publisher content',url:'https://blog.example/post',domain:'blog.example',ogImage:null}));
 const article=await fetchPlatformSource('https://news.ycombinator.com/item?id=123',{get:async()=>({type:'story',title:'AI',url:'https://blog.example/post'}),readArticle});expect(article?.content).toBe('Actual publisher content');expect(readArticle).toHaveBeenCalledWith('https://blog.example/post');
});
it('requires X credentials before calling any endpoint and accepts only public Telegram posts',async()=>{
 const get=vi.fn(async()=>({}));
 await expect(fetchPlatformSource('https://x.com/user/status/123',{get,env:{}})).rejects.toThrow(/X_BEARER_TOKEN/);expect(get).not.toHaveBeenCalled();
 await expect(fetchPlatformSource('https://t.me/c/123/456',{get})).rejects.toThrow(/công khai/);expect(get).not.toHaveBeenCalled();
 const html='<div class="tgme_widget_message_wrap"><div data-post="PublicAI/42"><div class="tgme_widget_message_text js-message_text">Public AI release</div><time datetime="2026-10-29T00:00:00Z"></time></div></div>';
 const post=await fetchPlatformSource('https://t.me/PublicAI/42',{get:async()=>html});expect(post?.content).toBe('Public AI release');
});
it('uses public Product Hunt feed content rather than inventing product details',async()=>{
 const s=await fetchPlatformSource('https://www.producthunt.com/posts/tool',{get:async()=>'<feed><entry><title>AI Tool</title><link href="https://www.producthunt.com/posts/tool"/><summary>Public product description</summary></entry></feed>'});expect(s?.content).toBe('Public product description');expect(s?.sourceScope).toContain('RSS');
});
it('uses Reddit OAuth when supplied and reports inaccessible public feeds honestly',async()=>{
 const get=vi.fn(async(_url:string)=>[{data:{children:[{data:{title:'AI post',selftext:'Public original post'}}]}}]);
 const s=await fetchPlatformSource('https://www.reddit.com/r/MachineLearning/comments/abc123/title/',{get,env:{REDDIT_ACCESS_TOKEN:'test-token'}});expect(s?.content).toBe('Public original post');expect(get.mock.calls[0][0]).toContain('oauth.reddit.com');
 await expect(fetchPlatformSource('https://reddit.com/r/MachineLearning/comments/abc123/title/',{get:async()=>'<html>Blocked</html>',env:{}})).rejects.toThrow(/quyền|TOKEN/);
});
it('preserves existing publisher imports and rejects login/challenge pages',async()=>{
 const body='Thông tin AI có thật từ bài báo, đủ chi tiết về nội dung, cách sử dụng và giới hạn của công nghệ mới. '.repeat(4);
 nock('https://vnexpress.net').get('/ai-news').reply(200,`<html><title>Tin AI</title><nav>Menu</nav><article><p>${body}</p></article><footer>Footer</footer></html>`);
 const s=await fetchSourceContent('https://vnexpress.net/ai-news');expect(s.title).toBe('Tin AI');expect(s.content).toContain('Thông tin AI');expect(s.content).not.toContain('Menu');
 nock('https://blog.example').get('/blocked').reply(200,'<html><title>Just a moment</title>Challenge</html>');
 await expect(fetchSourceContent('https://blog.example/blocked')).rejects.toThrow(/công khai/);
});
