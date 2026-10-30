// Radar only discovers and filters public metadata. Import uses the existing Studio URL flow.
document.addEventListener('DOMContentLoaded',()=>{
 const byId=id=>document.getElementById(id),cards=byId('radarCards'),status=byId('radarStatus'),source=byId('radarSource'),category=byId('radarCategory'),sort=byId('radarSort'),search=byId('radarSearch'),refresh=byId('radarRefresh');
 const categories={news:'Tin AI',repos:'GitHub repo',tools:'Công cụ AI',models:'Model',research:'Nghiên cứu'};
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let requestId=0,timer,searchTimer,active=false;
 const date=value=>value?new Date(value).toLocaleString('vi-VN',{dateStyle:'medium',timeStyle:'short'}):'Nguồn không cung cấp ngày đăng';
 async function load(){
  const id=++requestId;refresh.disabled=true;cards.setAttribute('aria-busy','true');status.textContent='Đang đọc các nguồn RSS / API công khai…';
  try{
   const params=new URLSearchParams();if(source.value)params.set('source',source.value);if(category.value)params.set('category',category.value);params.set('sort',sort.value);if(search.value.trim())params.set('q',search.value.trim());
   const response=await fetch('/api/radar?'+params);const data=await response.json();if(!response.ok)throw Error(data.error||'Không tải được Radar.');if(id!==requestId)return;
   const selected=source.value;
   source.innerHTML='<option value="">Tất cả nguồn</option>'+data.sources.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}${s.state==='ok'?'':' · chưa truy cập'}</option>`).join('');source.value=selected;
   const ok=data.sources.filter(s=>s.state==='ok').length;
   byId('feedsCountBadge').textContent=`${data.items.length} / ${data.total} mục`;
   status.textContent=`${ok}/${data.sources.length} nguồn truy cập được · Đã gộp ${data.duplicatesRemoved} bài trùng · Cập nhật ${date(data.fetchedAt)}. Không gọi Gemini khi quét Radar.`;
   byId('radarSources').innerHTML=data.sources.map(s=>`<div class="radar-source-row"><span class="radar-state ${esc(s.state)}">${s.state==='ok'?'●':s.state==='error'?'!':'○'}</span><strong>${esc(s.name)}</strong><span>${s.state==='ok'?`${s.count} mục phù hợp`:esc(s.message)}</span></div>`).join('');
   cards.replaceChildren();
   if(!data.items.length){const p=document.createElement('p');p.className='radar-empty';p.textContent='Không có kết quả phù hợp. Thử đổi bộ lọc hoặc xem trạng thái nguồn; Radar không tạo tin mẫu khi nguồn lỗi.';cards.append(p);}
   let visible=0;const more=document.createElement('button');more.className='btn btn-secondary radar-load-more';more.type='button';
   const append=()=>{more.remove();
   for(const item of data.items.slice(visible,visible+30)){
    const card=document.createElement('article');card.className='radar-card';
    card.innerHTML=`<div class="radar-card-meta"><span class="feed-source-pill">${esc(item.sourceName)}</span><span>${esc(categories[item.category]||item.category)}</span></div><h4><a href="${esc(item.link)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a></h4><time${item.pubDate?` datetime="${esc(item.pubDate)}"`:''}>${esc(date(item.pubDate))}</time><p class="radar-summary">${esc(item.description||'Nguồn không cung cấp tóm tắt. Import để đọc nội dung công khai nếu có.')}</p><div class="radar-signals">${item.signal?`${Number(item.signal.value).toLocaleString('vi-VN')} ${esc(item.signal.label)}`:'Chưa có chỉ số phổ biến'}${item.duplicateCount?`<span title="${esc(item.alsoSeenOn.join(', '))}"> · Gộp ${item.duplicateCount+1} mục trùng</span>`:''}</div><footer><a href="${esc(item.link)}" target="_blank" rel="noopener noreferrer">Xem nguồn ↗</a><button class="btn btn-primary" type="button" aria-label="Import ${esc(item.title)}">Import → Studio</button></footer>`;
    card.querySelector('button').addEventListener('click',()=>window.dispatchEvent(new CustomEvent('radar:import',{detail:{link:item.link}})));cards.append(card);
   }
   visible=Math.min(visible+30,data.items.length);if(visible<data.items.length){more.textContent=`Xem thêm · ${visible}/${data.items.length} mục`;cards.append(more);}
   };more.addEventListener('click',append);append();
  }catch(error){if(id===requestId){status.textContent=`Không tải được Radar: ${error.message}`;cards.replaceChildren();}}
  finally{if(id===requestId){refresh.disabled=false;cards.setAttribute('aria-busy','false');}}
 }
 window.addEventListener('app:mode',event=>{
  active=event.detail==='feeds';clearInterval(timer);
  if(active){load();timer=setInterval(()=>{if(!document.hidden)load();},300000);}
 });
 document.addEventListener('visibilitychange',()=>{if(active&&!document.hidden)load();});
 for(const control of [source,category,sort])control.addEventListener('change',load);
 search.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(load,300);});refresh.addEventListener('click',load);
});
