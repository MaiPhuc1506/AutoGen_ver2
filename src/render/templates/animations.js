// v2 Animation Engine — template-specific entrance animations
// HyperFrames runtime drives playback by seeking the timeline.
//
// IMPORTANT: Only use supported GSAP props: opacity, x, y, scale, scaleX, scaleY, rotation, width, height, visibility.
// Do NOT use `delay:` in vars — use position parameter (3rd arg) instead.
// Do NOT use `attr:` settings. No complex easings.

window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
window.__timelines["news-video"] = tl;

(function () {
  // ── Inject shimmer masks into all .shimmer-sweep-target elements ──────────
  document.querySelectorAll(".shimmer-sweep-target").forEach((el) => {
    if (!el.querySelector(".shimmer-mask")) {
      const mask = document.createElement("div");
      mask.className = "shimmer-mask";
      el.appendChild(mask);
    }
  });

  const stage = document.getElementById("stage");
  const scenes = Array.from(stage.querySelectorAll(".scene"));

  // ── Scene dispatch ──────────────────────────────────────────────────────
  scenes.forEach((scene) => {
    const start = parseFloat(scene.dataset.start);
    const dur   = parseFloat(scene.dataset.duration);
    const layout = scene.dataset.layout;

    // Scene visibility & transition (M5)
    const transType = scene.dataset.transition || "cut";
    const transDur  = parseFloat(scene.dataset.transitionDuration || "0.3");

    if (transType === "fade") {
      tl.fromTo(scene, { opacity: 0 }, { opacity: 1, duration: transDur }, start);
    } else if (transType === "slide") {
      tl.fromTo(scene, { x: 1080, opacity: 1 }, { x: 0, opacity: 1, duration: transDur }, start);
    } else if (transType === "zoom") {
      tl.fromTo(scene, { scale: 1.15, opacity: 0 }, { scale: 1.0, opacity: 1, duration: transDur }, start);
    } else {
      tl.set(scene, { opacity: 1 }, start);
    }
    tl.set(scene, { opacity: 0 }, start + dur);

    if(document.body.classList.contains('reference-design')){
      animateReference(scene,tl,start,dur);
      return;
    }

    // Adaptive pack motifs are part of the same seekable timeline as the narration.
    const art=scene.querySelector('.pack-art');
    if(art){
      const packClass=Array.from(document.body.classList).find(c=>c.startsWith('pack-')&&c!=='pack-active')||'';
      const stepped=/pixel|cel-boil/.test(packClass);
      tl.fromTo(art,{opacity:0,y:35,scale:.85},{opacity:1,y:0,scale:1,duration:Math.min(.6,dur/3),ease:stepped?'steps(5)':'back.out(1.1)'},start+.03);
      art.querySelectorAll('.pack-piece').forEach((piece,i)=>{
        tl.fromTo(piece,{y:35,opacity:0,scale:.85},{y:0,opacity:1,scale:1,duration:.35,ease:stepped?'steps(4)':'back.out(1.2)'},start+.08+(i%8)*.045);
      });
      art.querySelectorAll('.pack-draw').forEach(path=>{
        const length=path.getTotalLength();tl.fromTo(path,{strokeDasharray:length,strokeDashoffset:length},{strokeDashoffset:0,duration:Math.min(1.1,dur*.45),ease:'power1.inOut'},start+.12);
      });
      art.querySelectorAll('.pack-rotate,.pack-scan').forEach(el=>{
        tl.fromTo(el,{rotation:0,svgOrigin:'350 350'},{rotation:packClass.includes('hud')?90:12,svgOrigin:'350 350',duration:dur,ease:'none'},start);
      });
      art.querySelectorAll('.pack-boil').forEach(el=>{
        tl.fromTo(el,{x:-3,rotation:-.7},{x:3,rotation:.7,duration:.18,repeat:Math.max(0,Math.floor(dur/.18)-1),yoyo:true,ease:'steps(1)'},start);
      });
      art.querySelectorAll('.pack-morph').forEach(el=>{
        tl.fromTo(el,{attr:{rx:30},rotation:0,svgOrigin:'350 350'},{attr:{rx:210},rotation:35,svgOrigin:'350 350',duration:Math.max(.3,dur-.3),ease:'sine.inOut'},start+.15);
      });
      if(/liquid|soft-3d|aurora-glass/.test(packClass))tl.to(art,{y:-32,rotation:4,duration:Math.max(.2,dur-.7),ease:'sine.inOut'},start+.65);
      art.querySelectorAll('.pack-grid-lines').forEach(el=>tl.fromTo(el,{y:0},{y:38,duration:dur,ease:'none'},start));
    }

    // Seekable asset entrance and explainer steps, independent of colour/style.
    scene.querySelectorAll('.visual-asset').forEach(el => {
      tl.fromTo(el,{y:70,rotationX:8,scale:0.92,opacity:0},{y:0,rotationX:0,scale:1,opacity:1,duration:Math.min(0.5,dur/4),ease:'back.out(1.15)'},start+0.1);
    });
    scene.querySelectorAll('.workflow-step,.workflow-connector,.code-line').forEach((el,i) => {
      tl.fromTo(el,{x:24,y:12,opacity:0},{x:0,y:0,opacity:1,duration:0.25},start+0.15+i*Math.min(0.25,dur/16));
    });
    const nodes=scene.querySelectorAll('.semantic-node');
    nodes.forEach((node,i)=>tl.fromTo(node,{y:32,scale:.94,opacity:0},{y:0,scale:1,opacity:1,duration:Math.min(.4,dur/8),ease:'power2.out'},start+.15+i*Math.min(.7,dur/(nodes.length+2))));
    scene.querySelectorAll('.semantic-link').forEach((link,i)=>{
      const at=start+.45+i*Math.min(.7,dur/6);
      tl.fromTo(link,{scaleY:0,opacity:0},{scaleY:1,opacity:1,duration:Math.min(.35,dur/10)},at);
      const pulse=link.querySelector('i');if(pulse)tl.fromTo(pulse,{y:-12,opacity:0},{y:20,opacity:1,duration:Math.min(.5,dur/8)},at+.15);
    });
    scene.querySelectorAll('.code-highlight').forEach((line,i)=>tl.fromTo(line,{backgroundColor:'transparent'},{backgroundColor:'rgba(54,213,228,.23)',duration:.3},start+Math.min(dur*.5,.8+i*.35)));
    const explainerTitle=scene.querySelector('.explainer-title');
    if(explainerTitle) tl.fromTo(explainerTitle,{y:35,opacity:0},{y:0,opacity:1,duration:0.3},start+0.04);

    // Ken Burns animation for scene media (M2)
    const mediaImg = scene.querySelector(".scene-media-img.fx-kenburns");
    if (mediaImg) {
      tl.fromTo(mediaImg, { scale: 1.0, x: 0 }, { scale: 1.15, x: -25, duration: dur, ease: "none" }, start);
    }

    if(layout === "outro") animateFollowCard(scene,tl,start,dur);

    if (document.body.classList.contains("motion-dynamic")) {
      animateDynamic(scene, tl, start, dur);
      return;
    }
    if (document.body.classList.contains("tech-editorial")) {
      animateEditorial(scene, tl, start, dur);
      return;
    }

    if (layout === "hook") {
      animateHook(scene, tl, start);
    } else if (layout === "comparison") {
      animateComparison(scene, tl, start);
    } else if (layout === "stat-hero") {
      animateStatHero(scene, tl, start);
    } else if (layout === "feature-list") {
      animateFeatureList(scene, tl, start);
    } else if (layout === "callout") {
      animateCallout(scene, tl, start);
    } else if (layout === "outro") {
      animateOutro(scene, tl, start, dur);
    } else if (layout === "spec-table") {
      animateSpecTable(scene, tl, start);
    } else if (layout === "pros-cons") {
      animateProsCons(scene, tl, start);
    } else if (layout === "verdict-score") {
      animateVerdictScore(scene, tl, start);
    } else if (layout === "price-tag") {
      animatePriceTag(scene, tl, start);
    } else if (layout === "image-gallery") {
      animateImageGallery(scene, tl, start);
    } else if (layout === "phone-mockup") {
      animatePhoneMockup(scene, tl, start);
    }
  });

  // All motion is seekable: no random values, intervals or wall-clock animation.
  if (document.body.classList.contains('motion-dynamic')) {
    const total = parseFloat(stage.dataset.duration);
    tl.fromTo('.motion-grid', {x:0,y:0}, {x:-24,y:24,duration:total,ease:'none'},0);
    tl.fromTo('.orb-one', {x:-40,y:-30,scale:0.9}, {x:60,y:40,scale:1.1,duration:total,ease:'none'},0);
    tl.fromTo('.orb-two', {x:30,y:40}, {x:-80,y:-50,duration:total,ease:'none'},0);
    stage.querySelectorAll('.motion-specks i').forEach((el,i)=>{
      tl.fromTo(el,{y:0,opacity:0.12},{y:-40-(i%4)*20,opacity:0.55,duration:total,ease:'none'},0);
    });
  }
  if(document.body.classList.contains('reference-design')){
    const total=parseFloat(stage.dataset.duration);
    stage.querySelectorAll('.reference-specks i').forEach((el,i)=>tl.fromTo(el,{y:0,opacity:.22+(i%3)*.06},{y:-24-(i%5)*13,opacity:.3+(i%3)*.07,duration:total,ease:'none'},0));
    tl.fromTo('.reference-topline',{scaleX:0},{scaleX:1,duration:total,ease:'none',transformOrigin:'left center'},0);
    document.fonts.ready.then(()=>{
      stage.querySelectorAll('.ref-hook-identity').forEach(el=>{
        const ratio=Math.min(1,430/Math.max(el.scrollHeight,1));
        if(ratio<1){el.style.transformOrigin='top center';el.style.transform='scale('+ratio+')';}
      });
      stage.querySelectorAll('.ref-composition:not(.ref-hero-composition):not(.ref-outro-composition) .ref-board-canvas').forEach(el=>{
        const ratio=Math.min(1,1000/Math.max(el.scrollHeight,1));
        if(ratio<1){el.style.transformOrigin='top center';el.style.transform='scale('+ratio+')';}
      });
      stage.querySelectorAll('.scene [class^="layout-"],.scene .explainer-content').forEach(el=>{
        const ratio=Math.min(1,el.clientHeight/Math.max(el.scrollHeight,1),el.clientWidth/Math.max(el.scrollWidth,1));
        if(ratio<1){el.style.transformOrigin='top center';el.style.transform='scale('+ratio+')';}
      });
    });
  }
  function animateReference(scene,tl,start,dur){
    // Snappy, seekable visual transitions aligned with audio cues (no slow blurs).
    const composition=scene.querySelector('.ref-composition');
    const exit=Math.min(.22,dur*.08);
    if(composition){
      tl.fromTo(composition,{filter:'blur(0px)',opacity:1,scale:1},{filter:'blur(4px)',opacity:0,scale:.985,duration:exit,ease:'power2.in'},start+dur-exit);
    }
    scene.querySelectorAll('[data-reveal-at],[data-ref-enter]').forEach(el=>{
      const local=Number(el.dataset.revealAt ?? el.dataset.refEnter);
      const at=start+(el.dataset.revealAt!==undefined?local:Math.min(local,Math.max(0,dur-exit-.35)));
      const isHookGlass=scene.dataset.layout==='hook' && el.classList.contains('ref-glass');
      const entrance=Math.min(Number(el.dataset.revealDuration)||(isHookGlass?.32:.24),dur/6);
      
      tl.fromTo(el,
        {opacity:0,y:isHookGlass?18:10,scale:isHookGlass?.9:.98,filter:isHookGlass?'blur(4px)':'blur(0px)'},
        {opacity:1,y:0,scale:1,filter:'blur(0px)',duration:entrance,ease:'power2.out'},
        at
      );

      // Subtle visual rhythm on illustrations / media panels (Beat 2/3 Ken Burns)
      const mediaImg=el.querySelector('img, video');
      if(mediaImg && (dur - (at - start) > 1.5)){
        const mediaDur = Math.max(0.5, dur - (at - start) - exit);
        tl.fromTo(mediaImg, {scale: 1}, {scale: 1.035, duration: mediaDur, ease: 'none'}, at);
      }
    });
    const starBadge=scene.querySelector('.ref-github-stars');
    if(starBadge){
      const beat=start+Number(starBadge.dataset.revealAt??starBadge.dataset.refEnter??.03);
      const steps=starBadge.querySelectorAll('[data-star-step]');
      steps.forEach((el,i)=>{
        tl.set(el,{opacity:0},0);
        tl.set(el,{opacity:1},beat+.08+i*.065);
        if(i<steps.length-1)tl.set(el,{opacity:0},beat+.08+(i+1)*.065);
      });
      tl.fromTo(starBadge.querySelector('.ref-star-icon'),{rotation:-100,scale:.25},{rotation:0,scale:1,duration:.5,ease:'back.out(1.4)'},beat);
      starBadge.querySelectorAll('.ref-star-spark').forEach((el,i)=>{
        tl.fromTo(el,{opacity:0,scale:0,rotation:-35},{opacity:1,scale:1,rotation:30,duration:.2},beat+.25+i*.08);
        tl.to(el,{opacity:0,scale:.3,duration:.25},beat+.55+i*.08);
      });
      tl.fromTo(starBadge,{boxShadow:'0 0 0px #e9b84c00'},{boxShadow:'0 0 65px #e9b84c30',duration:.4,yoyo:true,repeat:1},beat+.15);
    }
    const name=scene.querySelector('.ref-product-name');
    if(name){
      const cycles=Math.max(1,Math.floor(dur/2));
      tl.fromTo(name,{backgroundPosition:'100% 0%'},{backgroundPosition:'0% 0%',duration:dur/cycles,repeat:cycles-1,ease:'none'},start);
      // Fit longer product names without moving the repository/benefit pills.
      const count=name.textContent.length;
      if(count>12)name.style.setProperty('font-size',Math.max(52,110*12/count)+'px','important');
    }
    scene.querySelectorAll('.ref-connector i,.ref-status i,.ref-code-status>i').forEach((el,i)=>{
      tl.fromTo(el,{opacity:.4,scale:.8},{opacity:1,scale:1.12,duration:.7,repeat:Math.max(0,Math.floor(dur/.7)-1),yoyo:true,ease:'sine.inOut'},start+(i%2)*.1);
    });
  }
  function animateDynamic(scene, tl, start, dur) {
    animateEditorial(scene, tl, start, dur);
    const entrance = Math.min(0.36,dur*0.18);
    const layout = scene.querySelector('[class^="layout-"]');
    if (layout) tl.fromTo(layout,{scale:0.96,y:30},{scale:1,y:0,duration:entrance,ease:'power3.out'},start);
    const kicker = scene.querySelector('.scene-kicker');
    if (kicker) tl.fromTo(kicker,{opacity:0,x:-25},{opacity:1,x:0,duration:0.25},start+0.04);
    const ordinal = scene.querySelector('.scene-ordinal');
    if (ordinal) tl.fromTo(ordinal,{opacity:0,x:30},{opacity:0.055,x:0,duration:0.5},start+0.12);
    const progress = scene.querySelector('.scene-progress-fill');
    if (progress) tl.fromTo(progress,{scaleX:0},{scaleX:1,duration:dur,ease:'none'},start);
    const wipe=scene.querySelector('.motion-wipe');
    if(wipe) {
      tl.fromTo(wipe,{x:-140,opacity:0},{x:1150,opacity:0.3,duration:Math.min(0.46,dur/3),ease:'power2.out'},start);
      tl.set(wipe,{opacity:0},start+Math.min(0.46,dur/3));
    }
    const words=scene.querySelectorAll('.hook-word');
    words.forEach((word,i)=>{
      const beat=start+0.06+i*Math.min(0.055,dur/(words.length*5));
      tl.fromTo(word,{y:58,rotation:3,scale:0.9,opacity:0},{y:0,rotation:0,scale:1,opacity:1,duration:entrance,ease:'back.out(1.25)'},beat);
      const swipe=word.querySelector('.word-swipe');
      if(swipe) tl.fromTo(swipe,{scaleX:0},{scaleX:1,duration:0.28,ease:'power2.out'},beat+0.2);
    });
    scene.querySelectorAll('.stat-digit').forEach((digit,i)=>{
      tl.fromTo(digit,{y:80,rotation:-10,opacity:0},{y:0,rotation:0,opacity:1,duration:0.32,ease:'back.out(1.3)'},start+0.08+i*0.045);
    });
    scene.querySelectorAll('.stat-orbit').forEach((orbit,i)=>{
      tl.fromTo(orbit,{scale:0.5,rotation:-30,opacity:0},{scale:1,rotation:i?18:0,opacity:i?0.12:0.3,duration:0.5},start+0.08);
      tl.to(orbit,{rotation:i?-12:20,duration:Math.max(0.1,dur-0.6),ease:'none'},start+0.6);
    });
    scene.querySelectorAll('.feature-index').forEach((el,i)=>{
      tl.fromTo(el,{scale:0.5,rotation:-15},{scale:1,rotation:0,duration:0.3,ease:'back.out(1.5)'},start+0.2+i*0.22);
    });
    const arrow=scene.querySelector('.out-arrow');
    if(arrow) tl.fromTo(arrow,{scale:0.5,rotation:-45,opacity:0},{scale:1,rotation:0,opacity:1,duration:0.4,ease:'back.out(1.2)'},start+0.2);
  }

  // Editorial: restrained, deterministic motion; reveal details on spoken phrases.
  function animateEditorial(scene, tl, start, dur) {
    const hero = scene.querySelector('.hook-headline,.stat-value,.feat-title,.callout-statement,.spec-header,.pros-cons-title,.verdict-product,.price-product,.gallery-title,.mockup-title,.out-cta-top');
    if (hero) tl.fromTo(hero, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: Math.min(0.25, dur / 4) }, start + 0.04);
    const containers = scene.querySelectorAll('.feat-card,.callout-card,.pros-col,.cons-col,.phone-frame');
    containers.forEach(el => tl.fromTo(el, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.2 }, start + 0.04));
    const norm = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9đ]+/g, ' ').trim();
    const spoken = Array.from(stage.querySelectorAll('.caption-word')).filter(w => {
      const t = parseFloat(w.dataset.wordStart);
      return t >= start && t < start + dur;
    });
    const tokens = spoken.map(w => norm(w.querySelector('.word-text').textContent));
    const details = scene.querySelectorAll('.hook-subhead,.stat-label,.stat-context,.feat-rule,.feat-bullet,.callout-tag,.spec-row,.pro-item,.con-item,.verdict-score-badge,.verdict-text,.verdict-summary,.price-main,.price-note,.gallery-card,.mockup-caption,.cmp-card,.cmp-vs,.out-channel,.out-source');
    details.forEach((el, i) => {
      const target = norm(el.textContent).split(' ').filter(Boolean).slice(0, 3);
      const index = target.length >= 2 ? tokens.findIndex((_, j) => target.every((t, k) => tokens[j + k] === t)) : -1;
      const fallback = start + Math.min(dur * 0.65, 0.2 + i * Math.min(0.3, dur / (details.length + 3)));
      const beat = index >= 0 ? Math.max(start + 0.08, parseFloat(spoken[index].dataset.wordStart) - 0.06) : fallback;
      tl.fromTo(el, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: Math.min(0.22, dur / 5) }, beat);
    });

  }

  // ── HOOK ──────────────────────────────────────────────────────────────
  function animateHook(scene, tl, start) {
    const headline = scene.querySelector(".hook-headline");
    if (headline) {
      // Scale pop in
      tl.fromTo(headline, { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6 }, start + 0.15);
      // Shimmer sweep after entrance
      const mask = headline.querySelector(".shimmer-mask");
      if (mask) {
        tl.fromTo(mask, { x: "-120%" }, { x: "120%", duration: 1.0 }, start + 0.7);
      }
    }

    const subhead = scene.querySelector(".hook-subhead");
    if (subhead) {
      tl.fromTo(subhead, { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5 }, start + 0.55);
    }
  }

  // ── COMPARISON ────────────────────────────────────────────────────────
  function animateComparison(scene, tl, start) {
    const leftCard = scene.querySelector(".cmp-left");
    if (leftCard) {
      tl.fromTo(leftCard, { x: -80, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5 }, start + 0.15);
    }

    const vs = scene.querySelector(".cmp-vs");
    if (vs) {
      tl.fromTo(vs, { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35 }, start + 0.45);
    }

    const rightCard = scene.querySelector(".cmp-right");
    if (rightCard) {
      tl.fromTo(rightCard, { x: 80, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5 }, start + 0.6);
    }
  }

  // ── STAT HERO ─────────────────────────────────────────────────────────
  function animateStatHero(scene, tl, start) {
    const value = scene.querySelector(".stat-value");
    if (value) {
      tl.fromTo(value, { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6 }, start + 0.15);
      // Shimmer sweep on the stat value
      const mask = value.querySelector(".shimmer-mask");
      if (mask) {
        tl.fromTo(mask, { x: "-120%" }, { x: "120%", duration: 1.0 }, start + 0.7);
      }
    }

    const label = scene.querySelector(".stat-label");
    if (label) {
      tl.fromTo(label, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45 }, start + 0.55);
    }

    const context = scene.querySelector(".stat-context");
    if (context) {
      tl.fromTo(context, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 }, start + 0.85);
    }
  }

  // ── FEATURE LIST ──────────────────────────────────────────────────────
  function animateFeatureList(scene, tl, start) {
    const card = scene.querySelector(".feat-card");
    if (card) {
      tl.fromTo(card, { y: 60, scale: 0.95, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.5 }, start + 0.1);
    }

    const rule = scene.querySelector(".feat-rule");
    if (rule) {
      tl.fromTo(rule, { scaleX: 0, opacity: 1 }, { scaleX: 1, opacity: 1, duration: 0.4 }, start + 0.45);
    }

    const bullets = scene.querySelectorAll(".feat-bullet");
    bullets.forEach((b, i) => {
      tl.fromTo(b, { x: -40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4 }, start + 0.6 + i * 0.15);
    });
  }

  // ── CALLOUT ───────────────────────────────────────────────────────────
  function animateCallout(scene, tl, start) {
    const card = scene.querySelector(".callout-card");
    if (card) {
      tl.fromTo(card, { y: 50, scale: 0.92, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.55 }, start + 0.2);
    }
  }

  // ── OUTRO ─────────────────────────────────────────────────────────────
  function animateOutro(scene, tl, start, dur) {
    const cta = scene.querySelector(".out-cta-top");
    if (cta) {
      tl.fromTo(cta, { opacity: 0, y: -30 }, { opacity: 1, y: 0, duration: 0.45 }, start + 0.2);
    }

    const channel = scene.querySelector(".out-channel");
    if (channel) {
      tl.fromTo(channel, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.55 }, start + 0.55);
    }

    const underline = scene.querySelector(".out-underline");
    if (underline) {
      tl.fromTo(underline, { width: 0 }, { width: "600px", duration: 0.5 }, start + 0.9);
    }

    const source = scene.querySelector(".out-source");
    if (source) {
      tl.fromTo(source, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4 }, start + 1.3);
    }

  }

  // One seekable follow sequence for Classic, Editorial and every style pack.
  // All positions are fractions of scene duration, so a 3s preview also completes.
  function animateFollowCard(scene,tl,start,dur){
    const card=scene.querySelector('#tt-card');if(!card)return;
    const cursor=card.querySelector('.tt-cursor'),ring=card.querySelector('.tt-click-ring');
    const button=card.querySelector('#tt-follow-btn'),follow=card.querySelector('#tt-btn-follow'),following=card.querySelector('#tt-btn-following');
    tl.fromTo(card,{opacity:0,y:90,scale:.94},{opacity:1,y:0,scale:1,duration:dur*.12,ease:'back.out(1.1)'},start+dur*.08);
    if(cursor){
      tl.fromTo(cursor,{opacity:0,x:145,y:145},{opacity:1,x:0,y:0,duration:dur*.19,ease:'power2.out'},start+dur*.25);
      tl.to(cursor,{scale:.82,duration:dur*.035,transformOrigin:'5px 3px'},start+dur*.47);
      tl.to(cursor,{scale:1,duration:dur*.055},start+dur*.505);
      tl.to(cursor,{opacity:0,x:32,y:28,duration:dur*.12},start+dur*.73);
    }
    if(button){tl.to(button,{scale:.94,duration:dur*.035},start+dur*.47);tl.to(button,{scale:1,duration:dur*.07,ease:'back.out(1.5)'},start+dur*.505);}
    if(follow)tl.fromTo(follow,{opacity:1},{opacity:0,duration:dur*.025},start+dur*.51);
    if(following)tl.fromTo(following,{opacity:0},{opacity:1,duration:dur*.04},start+dur*.53);
    if(ring)tl.fromTo(ring,{opacity:.9,scale:.1},{opacity:0,scale:1.5,duration:dur*.13},start+dur*.48);
  }

  // ── CAPTIONS ANIMATION (M1) ──────────────────────────────────────────────
  const captionCues = Array.from(stage.querySelectorAll(".caption-cue"));
  captionCues.forEach((cue) => {
    const cueStart = parseFloat(cue.dataset.start);
    const cueDur   = parseFloat(cue.dataset.duration || "1.0");
    const cueEnd   = cueStart + cueDur;

    // Initial cue state: hidden
    tl.set(cue, { opacity: 0, visibility: "hidden" }, 0);
    // Show cue during its active time window
    tl.set(cue, { opacity: 1, visibility: "visible" }, cueStart);
    tl.set(cue, { opacity: 0, visibility: "hidden" }, cueEnd);

    // Word-level highlight
    const words = Array.from(cue.querySelectorAll(".caption-word"));
    words.forEach((w) => {
      if (document.body.classList.contains('tech-editorial') && cue.dataset.accuracy !== 'high' && cue.dataset.highlightMode !== 'estimated') return;
      const wStart = parseFloat(w.dataset.wordStart || w.dataset.start || "0");
      const wDur   = parseFloat(w.dataset.wordDuration || w.dataset.duration || "0.2");
      const wEnd   = wStart + wDur;
      const highlight = w.querySelector(".word-highlight");

      // Initial word state
      tl.set(w, { scale: 1.0 }, 0);
      if (highlight) tl.set(highlight, { opacity: 0 }, 0);

      // Active word state: scale up and reveal highlight
      tl.set(w, { scale: document.body.classList.contains('reference-design') ? 1 : 1.15 }, wStart);
      if (highlight) tl.set(highlight, { opacity: 1 }, wStart);

      // Finished word state: reset to normal
      tl.set(w, { scale: 1.0 }, wEnd);
      if (highlight) tl.set(highlight, { opacity: 0 }, wEnd);
    });
  });
})();
