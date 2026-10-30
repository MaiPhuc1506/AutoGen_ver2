/* Voice + editorial Studio. Keeps the existing dashboard and JSON workflow. */
window.Studio = (() => {
  let uploaded = null;
  let pending = null;
  let renderCallback = null;
  let previewUrl = null;
  let visualAssets = [];
  let visualRepo = "";
  let templateCatalog = [];
  let stylePacks = [];
  let currentPack = "reference";
  const el = id => document.getElementById(id);
  const message = text => { el('studioStatus').textContent = text; if (el('studioReview')?.open) el('studioReviewHint').textContent = text; };
  const api = async (url, options) => {
    const response = await fetch(url, options);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Yêu cầu thất bại (${response.status})`);
    }
    return response;
  };
  function settings() {
    const provider = el('studioProvider').value;
    if (el('studioMode').value === 'upload') {
      if (!uploaded) throw new Error('Hãy tải MP3/WAV lên trước.');
      return { provider: 'uploaded', voiceId: 'imported', speed: 1, settingsSource: 'script', uploadId: uploaded.uploadId, captionsSrt: el('studioSrt').value.trim() || undefined };
    }
    const voiceId = provider === 'edge-tts' ? el('studioEdgeVoice').value : provider==='zerotts' ? el('studioZeroVoice').value : el('studioVoiceId').value.trim();
    if (!voiceId) throw new Error('Điền Voice ID/Voice Code từ dịch vụ bạn chọn.');
    return { provider, voiceId, speed: Number(el('studioSpeed').value), settingsSource: 'script', pronunciation: el('studioPronunciation').value };
  }
  function syncMode() {
    const upload = el('studioMode').value === 'upload';
    el('studioAutoDirect').disabled=upload;
    el('studioFitDuration').checked=!upload;el('studioFitDuration').disabled=true;
    el('studioTtsFields').hidden = upload;
    el('studioUploadFields').hidden = !upload;
    syncProvider();
  }
  let options = [];
  function syncProvider() {
    const provider = el('studioProvider').value;
    el('studioEdgeVoiceGroup').hidden = provider !== 'edge-tts';
    el('studioVoiceIdGroup').hidden = ['edge-tts','zerotts'].includes(provider);
    el('studioZeroVoiceGroup').hidden=provider!=='zerotts';
    const choice = options.find(p => p.id === provider);
    el('studioVoiceId').value = choice?.voiceId || '';
    if(provider==='zerotts' && choice?.voices){const selected=el('studioZeroVoice').value;el('studioZeroVoice').replaceChildren(...choice.voices.map(v=>new Option(v.name,v.id)));el('studioZeroVoice').value=choice.voices.some(v=>v.id===selected)?selected:choice.voiceId;}
    el('ttsStatusBadge').querySelector('.status-text').textContent=choice?.name||provider;
    el('studioProviderHint').textContent = provider==='zerotts' ? (choice?.ready?'ZeroTTS đã cài. Giọng chạy local, không cần API key. Lần nghe đầu cần nạp model vài giây; nghe thử rồi chọn giọng bạn thích.':'ZeroTTS chưa cài model. Chạy npm run zerotts:setup trong thư mục project, hoặc chọn Edge TTS để dùng ngay.') : provider === 'edge-tts' ? 'Dùng ngay, cần kết nối Internet để tạo giọng.' : choice?.ready ? 'Đã có thông tin kết nối. Nghe thử trước khi tạo video.' : 'Chưa cấu hình API trong .env.local. Bạn có thể tạo voice trên website dịch vụ rồi chọn tải MP3/WAV.';
    el('studioSpeed').max = provider === 'vbee' ? '1.9' : '2';
    if (Number(el('studioSpeed').value) > Number(el('studioSpeed').max)) el('studioSpeed').value = el('studioSpeed').max;
  }
  async function preview(text, button) {
    const old = button.textContent;
    button.disabled = true;
    button.textContent = 'Đang tạo giọng…';
    try {
      if(pending && el('studioReview').open)applyPronunciationOverrides();
      const voice = pending && el('studioReview').open ? pending.voice : settings();
      const player = el('studioReview').open ? el('studioReviewAudio') : el('studioAudio');
      if (voice.uploadId) {
        player.src = uploaded.audioUrl;
      } else {
        const response = await api('/api/studio/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text.slice(0, 500), voice }) });
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = URL.createObjectURL(await response.blob());
        player.src = previewUrl;
      }
      player.hidden = false;
      await player.play();
      message('Đang phát giọng bạn vừa chọn.');
    } catch (err) { message(err.message); }
    finally { button.disabled = false; button.textContent = old; }
  }
  function primaryField(td) {
    return ['headline','title','statement','label','productName','ctaTop'].find(key => typeof td[key] === 'string');
  }
  function applyPack(script,id) {
    const pack=stylePacks.find(p=>p.id===id);if(!pack)return;
    script.templatePack=id;script.visualStyle='tech-editorial';
    if(id==='reference'){script.creative={presetId:'reference',...script.creative};script.motionPreset='calm';script.captions={enabled:true,style:'minimal',highlightMode:'estimated'};}else delete script.creative;
  }
  function selectPack(id) {
    const pack=stylePacks.find(p=>p.id===id);if(!pack)return;
    currentPack=id;el('studioStyle').value='tech-editorial';el('studioMotion').disabled=false;el('studioMotion').value='calm';
    el('studioTheme').value=id==='explainer'?'midnight':'teal';el('studioTheme').disabled=Boolean(pack.adaptation);
    el('studioPackTitle').textContent=pack.name;el('studioPackDescription').textContent=pack.description+' Phù hợp: '+pack.goodFor+'.';
    el('studioStylePreview').src=pack.previewUrl;
    el('studioPackSource').hidden=!pack.sourceUrl;if(pack.sourceUrl)el('studioPackSource').href=pack.sourceUrl;
    el('studioPackGrid').querySelectorAll('button').forEach(b=>{const active=b.dataset.pack===id;b.classList.toggle('is-selected',active);b.setAttribute('aria-pressed',String(active));});
  }
  function buildPackGallery() {
    el('studioPackGrid').replaceChildren();el('studioPackCount').textContent=`${templateCatalog.length} bố cục · 1 thiết kế chung`;
    templateCatalog.forEach(template=>{
      const button=document.createElement('button');button.type='button';button.className='pack-card';button.dataset.layout=template.id;
      const name=document.createElement('strong');name.textContent=template.label;
      const desc=document.createElement('span');desc.className='pack-card-description';desc.textContent='Studio tối · Thẻ hiện theo lời đọc';
      button.append(name,desc);button.addEventListener('click',()=>{
        currentPack='reference';el('studioStyle').value='tech-editorial';
        el('studioPackTitle').textContent=template.label;
        el('studioPackDescription').textContent='Bố cục minh họa. Khi dựng, hệ thống phối bố cục theo nội dung; mọi cảnh dùng thiết kế video mẫu.';
        el('studioStylePreview').src='/api/studio/style-preview?pack=reference&layout='+encodeURIComponent(template.id);
        el('studioPackSource').hidden=true;
        el('studioPackGrid').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
      });el('studioPackGrid').append(button);
    });
    if(stylePacks.length)selectPack('reference');
  }
  async function blockTimingEditor(container,scene){
    const data=await(await api('/api/studio/block-plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scene})})).json();
    data.blocks.forEach(block=>{
      const row=document.createElement('label');row.className='block-timing-row';row.textContent=block.text.slice(0,85);
      const input=document.createElement('input');input.type='number';input.min='0';input.max='180';input.step='.05';input.placeholder='Tự động theo lời';input.value=scene.blockTiming?.[block.id]?.atSec??'';
      input.setAttribute('aria-label','Giây xuất hiện: '+block.text);
      input.addEventListener('change',()=>{
        scene.blockTiming??={};if(input.value==='')delete scene.blockTiming[block.id];else scene.blockTiming[block.id]={atSec:Number(input.value)};
      });row.append(input);container.append(row);
    });
  }
  function showCoverage(script) {
    const section=el('studioCoverage');section.replaceChildren();section.hidden=!script.coverage;
    if(!script.coverage)return;
    const heading=document.createElement('h3');heading.textContent='Kiến thức đã đưa vào bản nháp';section.append(heading);
    const scope=document.createElement('p');scope.className='field-hint';scope.textContent='Đối chiếu theo tài liệu/văn bản đã cung cấp, chưa kiểm chứng toàn bộ code. AI lập bảng này trước khi bạn sửa lời; hãy duyệt lại các nhận định.';section.append(scope);
    const labels={purpose:'Repo giải quyết việc gì',features:'Tính năng chính',usage:'Cách bắt đầu',requirements:'Điều kiện sử dụng',limitations:'Giới hạn cần biết',examples:'Ví dụ / ứng dụng'};
    script.coverage.items.forEach(item=>{
      const details=document.createElement('details');details.className='coverage-item coverage-'+item.status;
      const summary=document.createElement('summary');summary.textContent=labels[item.topic]+' · '+({covered:'Có trong bản nháp','not-in-source':'Nguồn chưa nói rõ',deferred:'Chưa đưa vào video','needs-review':'Cần duyệt lại đối chiếu'}[item.status]);
      const text=document.createElement('p');text.textContent=item.summary+(item.sceneIds.length?' · Cảnh: '+item.sceneIds.join(', '):'');details.append(summary,text);
      if(item.evidence){const quote=document.createElement('blockquote');quote.textContent=item.evidence;details.append(quote);}section.append(details);
    });
    if(script.coverage.warnings?.length){const warning=document.createElement('p');warning.className='coverage-omitted';warning.textContent=script.coverage.warnings.join(' ');section.append(warning);}
    if(script.coverage.omittedTopics.length){const note=document.createElement('p');note.className='coverage-omitted';note.textContent='Chưa kịp nói: '+script.coverage.omittedTopics.join(' · ')+'. Có thể chọn Giải thích kỹ và tăng thời lượng.';section.append(note);}
  }
  function refreshVisualLibrary() {
    const chosen=el('studioLogo').value;
    el('studioVisualLibrary').replaceChildren();el('studioLogo').replaceChildren(new Option('Logo kênh DevPeek36 · mặc định',''));
    visualAssets.forEach(asset=>{
      const figure=document.createElement('figure');const img=document.createElement('img');img.src=asset.previewUrl;img.alt=asset.label;
      const caption=document.createElement('figcaption');caption.textContent=asset.label;figure.append(img,caption);el('studioVisualLibrary').append(figure);
      el('studioLogo').add(new Option(asset.label,asset.id));
    });
    if(visualAssets.some(a=>a.id===chosen))el('studioLogo').value=chosen;
  }
  async function fetchVisuals(url) {
    el('studioFetchVisuals').disabled=true;el('studioVisualStatus').textContent='Đang chụp GitHub và lấy ảnh README…';
    try {
      const data=await(await api('/api/studio/github-visuals',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})})).json();
      visualAssets=visualAssets.filter(a=>a.kind==='upload').concat(data.assets);visualRepo=data.repo;refreshVisualLibrary();
      el('studioVisualStatus').textContent=`Đã lấy ${data.assets.length} tư liệu. ${data.warnings.join(' ')}`;
    } finally {el('studioFetchVisuals').disabled=false;}
  }
  function sceneVisualEditor(card,scene) {
    const label=document.createElement('label');label.textContent='Ảnh / screenshot cho cảnh';const select=document.createElement('select');
    select.add(new Option('Không dùng ảnh',''));
    const current=scene.media?.src;
    if(current && !visualAssets.some(a=>'studio-asset:'+a.id===current))select.add(new Option('Ảnh đang có',current));
    visualAssets.forEach(a=>select.add(new Option(a.label,'studio-asset:'+a.id)));select.value=current||'';
    const presentation=document.createElement('select');presentation.setAttribute('aria-label','Cách hiển thị ảnh');
    [['card','Thẻ screenshot / ảnh'],['logo','Logo lớn giữa cảnh'],['background','Ảnh nền']].forEach(([v,t])=>presentation.add(new Option(t,v)));
    presentation.value=scene.media?.presentation||'card';
    const image=document.createElement('img');image.className='studio-scene-visual';
    const update=()=>{
      if(!select.value){delete scene.media;image.hidden=true;return;}
      const asset=visualAssets.find(a=>'studio-asset:'+a.id===select.value);
      scene.media={type:'image',src:select.value,fit:'contain',fx:'none',presentation:presentation.value,credit:asset?.source||scene.media?.credit};
      image.src=asset?.previewUrl||select.value;image.hidden=!asset;
    };
    select.addEventListener('change',update);presentation.addEventListener('change',update);
    if(current){const asset=visualAssets.find(a=>'studio-asset:'+a.id===current);image.hidden=!asset;if(asset)image.src=asset.previewUrl;}else image.hidden=true;
    card.append(label,select,presentation,image);
  }
  function applyPronunciationOverrides(){
    if(!pending)return;
    let map;try{map=JSON.parse(el('studioPronunciationOverrides').value);}catch{throw new Error('Từ điển phát âm riêng phải là JSON hợp lệ.');}
    if(!map||Array.isArray(map)||typeof map!=='object'||Object.keys(map).length>80||Object.entries(map).some(([k,v])=>!k.trim()||k.length>100||typeof v!=='string'||!v.trim()||v.length>200))throw new Error('Từ điển cần tối đa 80 mục từ gốc → cách đọc, không để trống.');
    pending.voice.pronunciationOverrides=map;
  }
  async function refreshPronunciation(script){
    const result=await(await api('/api/studio/pronunciation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({script})})).json();
    if(pending!==script)return;
    const box=el('studioPronunciationReport');box.replaceChildren();
    const unknown=[...new Set(result.scenes.flatMap(s=>s.unreviewed))];
    const note=document.createElement('p');note.textContent=unknown.length?'Thuật ngữ chưa có cách đọc riêng, nên nghe thử: '+unknown.join(', '):'Đã áp dụng từ điển cho thuật ngữ nhận diện được. Vẫn nên nghe thử giọng trước khi xuất.';box.append(note);
    result.scenes.forEach((s,i)=>{const details=document.createElement('details');const title=document.createElement('summary');title.textContent='Cảnh '+(i+1)+' · văn bản thực gửi TTS';const text=document.createElement('p');text.textContent=s.spoken;details.append(title,text);box.append(details);});
  }
  function showReview(script, callback) {
    pending = script;
    script.scenes.forEach(scene=>{if(scene.templateData.template==='hook')scene.githubStarLeadIn=Boolean(script.metadata.githubStars);});
    el('studioPronunciationReview').hidden=Boolean(script.voice.uploadId);
    el('studioPronunciationOverrides').value=JSON.stringify(script.voice.pronunciationOverrides||{},null,2);
    if(!script.voice.uploadId)refreshPronunciation(script).catch(err=>{el('studioPronunciationReport').textContent=err.message;});
    renderCallback = callback;
    el('studioReferenceDesign').checked=script.templatePack==='reference'||Boolean(script.creative);
    const packSelect=el('studioReviewPack');packSelect.replaceChildren();
    if(!script.templatePack&&script.visualStyle==='classic')packSelect.add(new Option('Classic · bản cũ','__legacy__'));
    stylePacks.forEach(p=>packSelect.add(new Option(p.name,p.id)));
    packSelect.value=script.templatePack||(script.visualStyle==='classic'?'__legacy__':script.colorTheme==='midnight'?'explainer':'editorial');
    showCoverage(script);
    el('studioReviewList').replaceChildren();
    if(script.templatePack==='reference'||script.creative){
      const label=document.createElement('label');label.textContent='Nhấn từ phụ đề';
      const select=document.createElement('select');select.add(new Option('Cho phép nhịp ước lượng khi TTS thiếu mốc từ','estimated'));select.add(new Option('Chỉ nhấn khi có mốc từ chính xác','accurate-only'));
      select.value=script.captions?.highlightMode||'accurate-only';select.addEventListener('change',()=>{script.captions ||= {enabled:true,style:'minimal'};script.captions.highlightMode=select.value;});el('studioReviewList').append(label,select);
    }
    if(script.metadata.githubStars){
      const stars=document.createElement('p');stars.className='hint';stars.textContent='★ '+script.metadata.githubStars.count.toLocaleString('vi-VN')+' sao GitHub · '+new Date(script.metadata.githubStars.fetchedAt).toLocaleDateString('vi-VN')+' · Huy hiệu sao hiện trước logo và tên sản phẩm. Số sao được lấy lại khi render.';el('studioReviewList').append(stars);
    }
    const weights = script.scenes.map(s => s.voiceText.split(/\s+/).length);
    const total = weights.reduce((a,b) => a+b, 0);
    let position = 0;
    script.scenes.forEach((scene, i) => {
      const card = document.createElement('section');
      card.className = 'studio-scene-card';
      const label = document.createElement('h4');
      label.textContent = `Cảnh ${i + 1} · ${scene.templateData.template}`;
      card.append(label);
      if(scene.storyboard){
        const plan=document.createElement('details');const title=document.createElement('summary');title.textContent='Storyboard · '+scene.storyboard.intent;
        const brief=document.createElement('p');brief.textContent=scene.storyboard.visualBrief;
        const evidence=document.createElement('p');evidence.textContent='Nguồn: '+scene.storyboard.evidence;
        const note=document.createElement('p');note.textContent=(scene.storyboard.status==='needs-review'?'Cần duyệt nguồn. ':'')+(scene.storyboard.basis==='conceptual'?'Minh họa khái niệm. ':'Ví dụ/tư liệu từ nguồn; chưa chạy kiểm chứng. ')+scene.storyboard.transitionReason;
        plan.append(title,brief,evidence,note);card.append(plan);
      }
      if (script.voice.uploadId && i > 0) {
        const boundaryLabel = document.createElement('label');
        boundaryLabel.textContent = 'Bắt đầu cảnh tại giây (ước lượng, có thể chỉnh sau khi nghe)';
        const boundary = document.createElement('input');
        boundary.type = 'number'; boundary.min = '0.01'; boundary.step = '0.01'; boundary.max = uploaded.durationSec;
        boundary.value = (script.voice.sceneBoundaries?.[i - 1] ?? position / total * uploaded.durationSec).toFixed(2);
        boundary.dataset.boundary = i - 1;
        card.append(boundaryLabel, boundary);
      }
      position += weights[i];
      const textLabel = document.createElement('label'); textLabel.textContent = 'Lời đọc / nội dung phụ đề';
      const text = document.createElement('textarea'); text.rows = 3; text.value = scene.voiceText; text.dataset.scene = i;
      text.addEventListener('input', () => { scene.voiceText = text.value; if(scene.type==='hook')delete scene.githubHookStyle; });
      card.append(textLabel, text);
      const key = primaryField(scene.templateData);
      if (key) {
        const titleLabel = document.createElement('label'); titleLabel.textContent = scene.templateData.template==='hook'&&(script.templatePack==='reference'||script.creative)?'Tóm tắt ý hook (tên sản phẩm chỉnh bên dưới)':'Chữ chính trên hình';
        const title = document.createElement('input'); title.value = scene.templateData[key];
        title.maxLength = {headline:40,title:40,statement:80,label:40,productName:40,ctaTop:30}[key] || 40;
        title.addEventListener('input', () => { scene.templateData[key] = title.value; });
        card.append(titleLabel, title);
      }
      if(scene.templateData.template==='hook' && (script.templatePack==='reference'||script.creative)){
        const note=document.createElement('p');note.className='hint';note.textContent='Hook mẫu: tên sản phẩm trên khối kính; câu vấn đề → giải pháp nằm ở lời đọc. Chọn logo sản phẩm trong phần tư liệu.';card.append(note);
        const hero=scene.templateData.hero ||= {name:script.metadata.title.slice(0,40)};
        for(const [field,label,max] of [['name','Tên sản phẩm trên hook',40],['category','Nhãn loại sản phẩm',32],['repository','Repo / nhãn nguồn',50],['before','Trước · vấn đề từ nguồn',40],['after','Sau · lợi ích từ nguồn',40]]){
          const lab=document.createElement('label');lab.textContent=label;
          const input=document.createElement('input');input.value=hero[field]||'';input.maxLength=max;
          input.addEventListener('input',()=>{const currentHero=scene.templateData.hero ||= {name:script.metadata.title.slice(0,40)};currentHero[field]=input.value;if(field==='name'&&!input.value.trim())input.setCustomValidity('Nhập tên sản phẩm');else input.setCustomValidity('');});card.append(lab,input);
        }
      }
      if(script.templatePack==='reference'||script.creative){
        const details=document.createElement('details'),label=document.createElement('summary');label.textContent='Thẻ bổ sung trên cùng bảng (JSON)';
        const field=document.createElement('textarea');field.rows=5;field.value=JSON.stringify(scene.referenceBoard||{},null,2);
        field.addEventListener('change',()=>{try{scene.referenceBoard=JSON.parse(field.value);field.setCustomValidity('');}catch{field.setCustomValidity('JSON thẻ bổ sung chưa hợp lệ');}});details.append(label,field);card.append(details);
      }
      const templateLabel=document.createElement('label');templateLabel.textContent='Bố cục cảnh (đổi sẽ đặt lại nội dung hiển thị)';
      const templateSelect=document.createElement('select');templateSelect.setAttribute('aria-label',`Bố cục cảnh ${i+1}`);
      templateCatalog.filter(t=>scene.type==='hook'?t.id==='hook':scene.type==='outro'?t.id==='outro':!['hook','outro'].includes(t.id)).forEach(t=>templateSelect.add(new Option(t.label,t.id)));
      templateSelect.value=scene.templateData.template;
      templateSelect.addEventListener('change',()=>{
        const selected=templateCatalog.find(t=>t.id===templateSelect.value);if(!selected)return;
        scene.templateData=JSON.parse(JSON.stringify(selected.data));delete scene.blockTiming;
        if(scene.templateData.template==='outro')scene.templateData.channelName=script.metadata.channel.slice(0,30);
        el('studioReview').close();showReview(script,callback);
      });
      const advanced=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Sửa đầy đủ nội dung bố cục (JSON)';
      const json=document.createElement('textarea');json.rows=7;json.className='studio-template-json';json.value=JSON.stringify(scene.templateData,null,2);json.dataset.templateScene=i;
      advanced.append(summary,json);advanced.addEventListener('toggle',()=>{if(advanced.open&&json.checkValidity())json.value=JSON.stringify(scene.templateData,null,2);});card.append(templateLabel,templateSelect,advanced);
      sceneVisualEditor(card,scene);
      const timing=document.createElement('details');const timingTitle=document.createElement('summary');timingTitle.textContent='Nhịp xuất hiện từng khối · giây từ đầu cảnh';timing.append(timingTitle);card.append(timing);
      let loaded=false;timing.addEventListener('toggle',()=>{if(timing.open&&!loaded){loaded=true;blockTimingEditor(timing,scene).catch(err=>{loaded=false;message(err.message);});}});
      const transitionLabel=document.createElement('label');transitionLabel.textContent='Chuyển cảnh';const transition=document.createElement('select');
      ['cut','fade','slide','zoom'].forEach(t=>transition.add(new Option(t,t)));transition.value=scene.transition?.type||'cut';
      transition.addEventListener('change',()=>{scene.transition={type:transition.value,duration:0.25};});card.append(transitionLabel,transition);
      json.addEventListener('change',()=>{try{const next=JSON.parse(json.value);if(next.template!==scene.templateData.template)throw new Error('Đổi bố cục bằng danh sách bên trên.');scene.templateData=next;json.setCustomValidity('');const main=card.querySelector('input:not([data-boundary])');const primary=primaryField(next);if(main&&primary)main.value=next[primary];}catch(err){json.setCustomValidity(err.message);message('JSON bố cục không hợp lệ: '+err.message);}});
      if (!script.voice.uploadId) {
        const listen = document.createElement('button'); listen.type = 'button'; listen.className = 'btn btn-secondary'; listen.textContent = 'Nghe thử cảnh này';
        listen.addEventListener('click', () => preview(scene.voiceText, listen)); card.append(listen);
      }
      el('studioReviewList').append(card);
    });
    const hookOptions = el('studioHookOptions');
    hookOptions.replaceChildren();
    hookOptions.hidden = Boolean(script.voice.uploadId) || !script.hookSuggestions?.length;
    if (!hookOptions.hidden) {
      const heading=document.createElement('h3');heading.textContent=script.hookSuggestions.length>1?'Hook đã chọn · có thể đổi nếu muốn':'Hook đã chọn';hookOptions.append(heading);
      const note=document.createElement('p');note.textContent=script.generation?.message || 'Chọn cách mở phù hợp, sau đó sửa lời theo giọng kênh của bạn.';hookOptions.append(note);
      script.hookSuggestions.forEach((hook,i)=>{
        const button=document.createElement('button');button.type='button';button.className='studio-hook-choice';button.dataset.hook=i;
        const title=document.createElement('strong');title.textContent=hook.label;
        const text=document.createElement('span');text.textContent=hook.voiceText;
        button.append(title,text);if(i===0)button.classList.add('selected');
        button.addEventListener('click',()=>{
          const scene=script.scenes[0];if(scene.templateData.template!=='hook')return;
          scene.voiceText=hook.voiceText;delete scene.githubHookStyle;scene.templateData.headline=hook.headline;scene.templateData.subhead=hook.subhead;
          el('studioReviewList').querySelector('[data-scene="0"]').value=hook.voiceText;
          const mainInput=el('studioReviewList').querySelector('.studio-scene-card input:not([data-boundary])');if(mainInput)mainInput.value=hook.headline;
          hookOptions.querySelectorAll('button').forEach(b=>b.classList.toggle('selected',b===button));
        });hookOptions.append(button);
      });
    }
    el('studioReviewHint').textContent = script.voice.uploadId ? 'Voice giữ nguyên tốc độ gốc. Lời đọc cần khớp audio. Mốc cảnh có thể chỉnh thủ công; SRT xác định thời gian phụ đề theo cụm, không phải từng từ.' : script.narrationTiming ? `Đã đo lời đọc thật · Thời lượng ${script.targetDurationSec.toFixed(1)} giây · Hook ${script.narrationTiming.hookSec.toFixed(1)} giây. Thời lượng theo nội dung và mức đã chọn; bạn không cần tự chỉnh độ dài.` : 'Tốc độ hiện tại áp dụng cho cả nghe thử và render.';
    el('studioAudio').pause();
    el('studioReviewAudio').hidden = !script.voice.uploadId;
    if (script.voice.uploadId) el('studioReviewAudio').src = uploaded.audioUrl;
    el('studioReview').showModal();
  }
  async function prepare(payload, callback) {
    const voice = settings();
    if(el('studioAutoVisuals').checked && /^https:\/\/github\.com\//.test(payload.url||'')) {
      const canonical=(payload.url||'').replace(/\/$/,'').replace(/\.git$/,'');
      if(visualRepo!==canonical)try{await fetchVisuals(payload.url);}catch(err){el('studioVisualStatus').textContent='Chưa lấy được tư liệu: '+err.message+' Bạn vẫn có thể tải ảnh thủ công.';}
    }
    const visualStyle = el('studioStyle').value;
    message('Đang viết hook, đo giọng đọc và chọn độ dài phù hợp trong mức đã chọn. Bước này có thể mất vài phút…');
    try {
    const response = await api('/api/generate-script', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, renderSettings:el('studioRenderMode').value==='standard'?{fps:30,quality:'standard',workers:2}:{fps:24,quality:'standard',workers:2}, creative:{presetId:'reference',hookType:el('studioHookType').value,structureId:el('studioStructure').value,pacingId:el('studioMotion').value==='dynamic'?'quick':'narrated'}, visualAssetIds: visualAssets.map(a=>a.id), directingMode: el("studioAutoDirect").checked ? "auto" : undefined, fitDuration: !voice.uploadId, voice, visualStyle, templatePack: currentPack || undefined, explanationLevel:el('studioDepth').value, contentMode:el('studioDepth').value==='quick'?'overview':'deep-dive', colorTheme: el('studioTheme').value, motionPreset: visualStyle === 'tech-editorial' ? el('studioMotion').value : undefined, soundDesign: el('studioSoundDesign').checked, bgm: {enabled: el('studioBgmEnabled').checked}, captions: { enabled: true, style: visualStyle === 'tech-editorial' ? 'minimal' : payload.captions?.style || 'tiktok-bold' } }) });
    const script = await response.json();
    const sourceLogo=el('studioLogo').value;if(sourceLogo)script.metadata.logoAssetId=sourceLogo;
    showReview(script, callback);
    message(script.narrationTiming ? `Đã đo audio · Thời lượng ${script.targetDurationSec.toFixed(1)} giây · Hook ${script.narrationTiming.hookSec.toFixed(1)} giây. Có thể xuất ngay hoặc chỉnh nếu muốn.` : 'Đã chuẩn bị kịch bản. Có thể chỉnh thêm nếu muốn.');
    } catch(error){message(error.message);throw error;}
  }
  document.addEventListener('DOMContentLoaded', async () => {
    el('studioMode').addEventListener('change', syncMode);
    el('studioProvider').addEventListener('change', syncProvider);
    el('studioSpeed').addEventListener('input', () => { el('studioSpeedValue').textContent = `${Number(el('studioSpeed').value).toFixed(2)}x`; });
    const refreshStylePreview = () => {
      el('studioMotion').disabled=el('studioStyle').value==='classic';
      if(currentPack&&el('studioStyle').value!=='classic'){el('studioStylePreview').src=`/api/studio/style-preview?pack=${currentPack}&motion=${el('studioMotion').value}`;return;}
      el('studioStylePreview').src=`/api/studio/style-preview?style=${el('studioStyle').value}&motion=${el('studioMotion').value}&theme=${el('studioTheme').value}`;
    };
    el('studioStyle').addEventListener('change',()=>{if(el('studioStyle').value==='classic'){currentPack=null;el('studioTheme').disabled=false;el('studioPackTitle').textContent='Classic · bản cũ';el('studioPackSource').hidden=true;el('studioPackGrid').querySelectorAll('button').forEach(b=>{b.classList.remove('is-selected');b.setAttribute('aria-pressed','false');});}else if(!currentPack){selectPack('reference');}refreshStylePreview();});
    el('studioMotion').addEventListener('change',refreshStylePreview);
    el('studioTheme').addEventListener('change',()=>{if(el('studioStyle').value!=='classic')selectPack('reference');else refreshStylePreview();});
    const contentPreferencesKey='studio.content-preferences.v1';
    try{
      const saved=JSON.parse(localStorage.getItem(contentPreferencesKey)||'{}');
      for(const [id,key] of [['studioDepth','depth'],['studioStructure','structure']]){
        if(Array.from(el(id).options).some(option=>option.value===saved[key]))el(id).value=saved[key];
      }
    }catch{/* Storage unavailable: keep the current selection. */}
    function syncDurationControls(){
      const level=el('studioDepth').value;
      const labels={quick:'Tối đa 60 giây; có thể ngắn hơn, không đệm lời cho đủ 60',standard:'Trên 60 đến 90 giây',detailed:'Từ 90 đến 120 giây'};
      el('selectPresetUrl').disabled=true;
      el('studioDurationHint').textContent=labels[level]+'. Web chọn độ dài theo nội dung sau khi đo giọng đọc. Preset cũ bên dưới không áp dụng.';
      el('studioQuickNews').setAttribute('aria-pressed',String(level==='quick'&&el('studioStructure').value==='news'));
      try{localStorage.setItem(contentPreferencesKey,JSON.stringify({depth:level,structure:el('studioStructure').value}));}catch{}
    }
    el('studioDepth').addEventListener('change',syncDurationControls);
    el('studioStructure').addEventListener('change',syncDurationControls);
    el('studioQuickNews').addEventListener('click',()=>{el('studioDepth').value='quick';el('studioStructure').value='news';syncDurationControls();});
    syncDurationControls();
    el('studioReferenceDesign').addEventListener('change',()=>{if(!pending)return;if(el('studioReferenceDesign').checked){applyPack(pending,'reference');el('studioReviewPack').value='reference';message('Đã áp dụng thiết kế video mẫu cho mọi cảnh. Bấm Xem thử để kiểm tra.');}else{delete pending.creative;pending.templatePack='editorial';el('studioReviewPack').value='editorial';}});
    el('studioReviewPack').addEventListener('change',()=>{if(!pending)return;const id=el('studioReviewPack').value;if(id==='__legacy__'){delete pending.templatePack;pending.visualStyle='classic';}else applyPack(pending,id);el('studioReferenceDesign').checked=id==='reference';message('Đã đổi template. Lời đọc và nội dung các cảnh được giữ nguyên; bấm Xem thử để kiểm tra.');});
    el('studioFetchVisuals').addEventListener('click',async()=>{try{await fetchVisuals(el('inputArticleUrl').value.trim());}catch(err){el('studioVisualStatus').textContent=err.message;}});
    el('studioVisualUpload').addEventListener('change',async()=>{
      const file=el('studioVisualUpload').files[0];if(!file)return;
      if(file.size>10*1024*1024){el('studioVisualStatus').textContent='Ảnh tối đa 10 MB.';return;}
      el('studioVisualUpload').disabled=true;
      try{const asset=await(await api('/api/studio/visuals?name='+encodeURIComponent(file.name),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file})).json();visualAssets.push(asset);refreshVisualLibrary();el('studioVisualStatus').textContent='Đã thêm ảnh. Bạn có thể chọn làm logo hoặc gắn vào từng cảnh.';}
      catch(err){el('studioVisualStatus').textContent=err.message;}finally{el('studioVisualUpload').disabled=false;}
    });
    el('studioLogo').addEventListener('change',()=>{if(pending){if(el('studioLogo').value)pending.metadata.logoAssetId=el('studioLogo').value;else delete pending.metadata.logoAssetId;}});
    el('studioListen').addEventListener('click', () => preview(el('studioPreviewText').value.trim() || 'Công cụ này giúp bạn tạo giao diện nhanh hơn. Chỉ một câu mô tả, các thành phần xuất hiện theo đúng nhịp lời đọc.', el('studioListen')));
    el('studioUpload').addEventListener('change', async () => {
      const file = el('studioUpload').files[0];
      uploaded = null;
      el('studioAudio').pause(); el('studioAudio').removeAttribute('src'); el('studioAudio').hidden = true;
      if (!file) return;
      if (file.size > 30 * 1024 * 1024 || !/\.(mp3|wav)$/i.test(file.name)) return message('Chọn MP3/WAV không quá 30 MB.');
      el('studioUpload').disabled = true;
      message('Đang kiểm tra audio…');
      try {
        const response = await api(`/api/studio/uploads?name=${encodeURIComponent(file.name)}`, { method:'POST', headers:{'Content-Type':'application/octet-stream'}, body:file });
        uploaded = await response.json();
        el('studioAudio').src = uploaded.audioUrl; el('studioAudio').hidden = false;
        el('studioUploadName').textContent = `${uploaded.name} · ${uploaded.durationSec.toFixed(1)} giây`;
        message('Audio đã sẵn sàng. Nhập lời đọc khớp với file ở phần nội dung bên dưới.');
      } catch (err) { el('studioUploadName').textContent = ''; message(err.message); }
      finally { el('studioUpload').disabled = false; }
    });
    el('studioSrtFile').addEventListener('change', async () => {
      const file = el('studioSrtFile').files[0];
      if (file && file.size <= 100000) el('studioSrt').value = await file.text();
      else message('SRT tối đa 100 KB.');
    });
    el('studioReviewPreview').addEventListener('click',async()=>{
      if(!pending)return;
      if(Array.from(el('studioReviewList').querySelectorAll('input,textarea,select')).some(t=>!t.checkValidity()))return message('Sửa JSON bố cục bị lỗi trước khi xem thử.');
      el('studioReviewPreview').disabled=true;
      try{const r=await api('/api/studio/preview-script',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({script:pending})});el('studioLayoutFrame').srcdoc=await r.text();el('studioLayoutPreview').showModal();}
      catch(err){message(err.message);}finally{el('studioReviewPreview').disabled=false;}
    });
    el('studioLayoutPreviewClose').addEventListener('click',()=>{el('studioLayoutPreview').close();el('studioLayoutFrame').srcdoc='';});
    el('studioReview').addEventListener('close', () => el('studioReviewAudio').pause());
    el('studioReviewClose').addEventListener('click', () => el('studioReview').close());
    el('studioApplyPronunciation').addEventListener('click',async()=>{
      try{applyPronunciationOverrides();await refreshPronunciation(pending);message('Đã áp dụng cách đọc riêng. Nghe thử cảnh có thuật ngữ để kiểm tra.');}catch(err){message(err.message);}
    });
    el('studioReviewRender').addEventListener('click', async () => {
      if (!pending || !renderCallback) return;
      try {
        const invalidJson=Array.from(el('studioReviewList').querySelectorAll('input,textarea,select')).find(t=>!t.checkValidity());
        if(invalidJson)throw new Error('Sửa JSON bố cục bị lỗi trước khi render.');
        if(!pending.voice.uploadId){applyPronunciationOverrides();await refreshPronunciation(pending);}
        if (pending.scenes.some(s => !s.voiceText.trim())) throw new Error('Lời đọc mỗi cảnh không được trống.');
        if (pending.voice.uploadId) {
          const bounds = Array.from(el('studioReviewList').querySelectorAll('[data-boundary]')).map(i => Number(i.value));
          if (bounds.some((b,i) => !Number.isFinite(b) || b <= (bounds[i-1] || 0) || b >= uploaded.durationSec)) throw new Error('Mốc cảnh phải tăng dần và nằm trong audio.');
          pending.voice.sceneBoundaries = bounds;
        }
        const callback = renderCallback; const script = pending;
        el('studioReview').close(); pending = null;
        await callback({ script });
      } catch (err) { el('studioReviewHint').textContent = err.message; }
    });
    try{stylePacks=(await(await api('/api/studio/style-packs')).json()).packs;}catch(err){el('studioPackCount').textContent='Chưa tải được template';message(err.message);}
    try{templateCatalog=(await(await api('/api/studio/templates')).json()).templates;buildPackGallery();}catch(err){message(err.message);}
    try { options = await (await api('/api/studio/options')).json().then(d => d.providers); }
    catch (err) { message(err.message); }
    syncMode();
  });
  async function reviewImported(script,callback){
    const response=await api('/api/studio/validate-script',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({script})});
    const validated=await response.json();showReview(validated.script,callback);
  }
  return { prepare, reviewImported, blockTimingEditor };
})();
