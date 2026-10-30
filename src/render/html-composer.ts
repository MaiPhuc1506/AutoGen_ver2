import {matchingGithubStars} from '../script/github-stars.js';
import {renderReferenceScene} from './reference-scenes.js';
import {referenceSettings,decorateReferenceBlocks} from './reference-design.js';
import {sourceLabel} from "./source-label.js";
import {packDecor,packVariables} from "./style-packs.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Script, TemplateDataType } from "./script-schema.js";
import type { TiktokConfig } from "../config.js";
import type { CaptionCue } from "../captions/types.js";
import type { MediaAssetRecord } from "../media/media-manager.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TPL_DIR = join(__dirname, "templates");

// Grain overlay HTML inline (from installed component)
const GRAIN_OVERLAY_HTML = `<div id="grain-overlay" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:100;"><div class="grain-texture"></div></div>`;

// Vignette — darkens far edges so content doesn't feel like it's floating in a flat void.
const VIGNETTE_HTML = `<div class="vignette"></div>`;

// Default TikTok config (used if not passed)
const DEFAULT_TIKTOK: TiktokConfig = {
  displayName: "DevPeek36",
  handle: "@DevPeek36",
  followers: "",
};

export interface SceneAudio {
  id: string;
  durationSec: number;
}

export interface ComposeArgs {
  /** Guides are editor-only. Omitted purpose always produces a clean export. */
  purpose?: 'export' | 'preview';
  script: Script;
  sceneAudio: SceneAudio[];
  gapSec: number;
  bgImageRelPath: string | null;   // null => no image available
  audioRelPath: string;
  /** TikTok follow card config (injected into outro scene). Optional — defaults used if omitted. */
  tiktok?: TiktokConfig;
  /** Relative path to avatar image inside the output dir (e.g. "tiktok-avatar.jpg"). */
  tiktokAvatarRelPath?: string;
  /** Extra seconds added to outro scene visual duration after voice ends (TikTok card hold). Default 3. */
  outroHoldSec?: number;
  /** Optional caption cues for word-by-word synced subtitles (M1). */
  captionCues?: CaptionCue[];
  /** Optional resolved media records mapped by sceneId (M2). */
  mediaMap?: Record<string, MediaAssetRecord>;
}

export function composeHtml(args: ComposeArgs): string {
  const { sceneAudio, gapSec, bgImageRelPath, audioRelPath } = args;
  const script:Script=args.script.templatePack || args.script.creative ? {...args.script,visualStyle:"tech-editorial",colorTheme:args.script.templatePack==="explainer"?"midnight":args.script.colorTheme} : args.script;
  const tiktok = args.tiktok ?? DEFAULT_TIKTOK;
  const tiktokAvatar = args.tiktokAvatarRelPath ?? "tiktok-avatar.jpg";
  const outroHoldSec = args.outroHoldSec ?? 3;
  const logo = args.mediaMap?.__logo__;
  const channelLogoPath = logo?.localRelPath || (script.metadata.channel.toLowerCase()==='devpeek36' ? tiktokAvatar : undefined);

  // Compute timing per scene. Outro scene gets extra HOLD seconds so the
  // TikTok follow card stays visible after the voice ends.
  let cursor = 0;
  const timing = script.scenes.map((scene) => {
    const audio = sceneAudio.find((a) => a.id === scene.id);
    if (!audio) throw new Error(`No audio entry for scene id=${scene.id}`);
    const isOutro = scene.type === "outro";
    const dur = audio.durationSec + gapSec + (isOutro ? outroHoldSec : 0);
    const start = cursor;
    cursor += dur;
    return { scene, start, duration: dur };
  });
  const totalDuration = cursor;

  const reference = referenceSettings(script);
  const dynamic = !reference && script.visualStyle === "tech-editorial" && script.motionPreset === "dynamic";

  // Render scenes
  const sceneHtml = timing.map(({ scene, start, duration },sceneIndex) => {
    scene={...scene,githubStarLeadIn:scene.templateData.template==='hook'&&Boolean(matchingGithubStars(script))};
    const mediaRecord = args.mediaMap?.[scene.id];
    const gallery=scene.templateData.template==='image-gallery'?scene.templateData.images.map((_,i)=>i===0&&mediaRecord?mediaRecord:args.mediaMap?.[`${scene.id}:gallery:${i}`]):[];
    let sceneMarkup = reference ? renderReferenceScene({scene,start,duration,script,media:mediaRecord,gallery,channelLogoPath,tiktok}) : renderScene(scene, start, duration, bgImageRelPath, tiktok, tiktokAvatar, mediaRecord, script.visualStyle, dynamic, channelLogoPath,gallery);
    if(!reference && script.templatePack && !['editorial','explainer'].includes(script.templatePack))sceneMarkup=sceneMarkup.replace(/(<div class="scene clip"[\s\S]*?>)/,'$1'+packDecor(script.templatePack));
    if (dynamic) {
      const index = sceneIndex;
      const label = scene.type === 'hook' ? 'MỞ ĐẦU' : scene.type === 'outro' ? 'KẾT NỐI' : 'ĐIỂM CHÍNH';
      const decor = `<div class="scene-kicker"><span class="kicker-dot"></span>${String(index+1).padStart(2,'0')} / ${String(script.scenes.length).padStart(2,'0')}<span class="kicker-label">${label}</span></div>
        <div class="scene-ordinal">${String(index+1).padStart(2,'0')}</div><div class="motion-wipe"></div>
        <div class="scene-progress"><div class="scene-progress-fill"></div></div>`;
      sceneMarkup = sceneMarkup.replace(/(<div class="scene clip"[\s\S]*?>)/, '$1' + decor);
    }
    if(reference)sceneMarkup=decorateReferenceBlocks(sceneMarkup,scene,start,duration,args.captionCues||[],reference);
    return sceneMarkup;
  }).join("\n");

  // Optional user-selected logo is resolved locally by the media manager.
  const logoHtml = channelLogoPath ? `<img class="project-logo" src="${escapeHtml(channelLogoPath)}" alt="Logo ${escapeHtml(script.metadata.channel)}" />` : '';

  // Persistent shell — uses tiktok handle in footer and avatar in header
  let shellHtml = script.visualStyle === 'tech-editorial'
    ? `<div class="shell-bg"></div><div class="brand-shell-header">${logoHtml}<div class="brand-name">${escapeHtml(script.metadata.channel)}</div></div>${VIGNETTE_HTML}${GRAIN_OVERLAY_HTML}`
    : renderShell(script.metadata, tiktok, logo?.localRelPath || tiktokAvatar);

  if (dynamic) shellHtml += `<div class="motion-grid"></div><div class="motion-orb orb-one"></div><div class="motion-orb orb-two"></div>
    <div class="motion-specks">${Array.from({length:12},(_,i)=>`<i style="left:${8+(i*29)%84}%;top:${15+(i*17)%66}%"></i>`).join('')}</div>
    <div class="editorial-footer"><span>${escapeHtml(sourceLabel(script.metadata.source.domain))}</span><span>${escapeHtml(script.metadata.channel)}</span></div>`;

  if(reference) shellHtml += `<div class="reference-specks" aria-hidden="true">${Array.from({length:36},(_,i)=>`<i style="left:${(i*37+5)%96}%;top:${(i*23+7)%96}%;width:${4+i%4*2}px;height:${4+i%4*2}px;--particle:${["#8ad8bf","#8a9fd0","#a48acb","#e3bc73"][i%4]}"></i>`).join('')}</div><div class="reference-topline"></div><div class="reference-footer">${escapeHtml(script.metadata.channel)}</div>`;

  // Render optional captions layer (M1)
  const captionsEnabled = script.captions?.enabled ?? false;
  let captionsHtml = "";
  if (captionsEnabled && args.captionCues && args.captionCues.length > 0) {
    const style = script.captions?.style ?? "tiktok-bold";
    captionsHtml = renderCaptions(args.captionCues, style, script.captions?.highlightMode);
  }

  // Saved/generated metadata must never burn editor guides into an MP4.
  const safeZoneHtml = args.purpose === 'preview' && script.metadata.safeZoneOverlay
    ? `<div id="safe-zone-overlay">
  <div class="safe-zone-guide-label top">TOP SAFE (150px)</div>
  <div class="safe-zone-guide-label right">ACTIONS SAFE (120px)</div>
  <div class="safe-zone-guide-label bottom">TIKTOK CAPTION SAFE-ZONE (380px)</div>
</div>`
    : "";

  const referenceCss = reference ? `<style>${readFileSync(join(TPL_DIR,'styles.reference.css'),'utf8')}</style>` : '';
  const animJs = readFileSync(join(TPL_DIR, "animations.js"), "utf8");

  const tpl = readFileSync(join(TPL_DIR, "base.html.tmpl"), "utf8");
  const base = script.visualStyle === 'tech-editorial'
    ? tpl.replace(/<link[^>]+(?:fonts.googleapis.com|fonts.gstatic.com)[^>]*>/g, '')
      .replace('https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js', 'gsap.min.js')
    : tpl;
  return base.replace('</head>',referenceCss+'</head>')
    .replace('<body>', script.visualStyle === 'tech-editorial' ? `<body class="tech-editorial${reference ? " reference-design" : ""}${dynamic ? " motion-dynamic" : ""}${script.colorTheme === "midnight" ? " theme-midnight" : ""}${script.templatePack ? " pack-active pack-"+script.templatePack : ""}">` : '<body>')
    .replace('<body class="', script.templatePack ? `<body style="${packVariables(script.templatePack)}" class="` : '<body class="')
    .replace("{{TITLE}}", escapeHtml(script.metadata.title))
    .replace(/\{\{TOTAL_DURATION\}\}/g, totalDuration.toFixed(2))
    .replace("{{SHELL}}", shellHtml)
    .replace("{{SCENES}}", sceneHtml)
    .replace("{{CAPTIONS}}", captionsHtml + safeZoneHtml)
    .replace(/src="voice\.mp3"/g, `src="${audioRelPath}"`)
    .replace('<script src="animations.js"></script>', `<script>\n${animJs}\n</script>`);
}

// ── CAPTIONS LAYER (M1) ────────────────────────────────────────────────────
function renderCaptions(cues: CaptionCue[], style: string, highlightMode?:string): string {
  return `
<!-- Captions layer (M1) -->
<div class="captions-container caption-style-${escapeHtml(style)}">
  ${cues.map((cue) => {
    const cueDur = (cue.endSec - cue.startSec).toFixed(3);
    return `  <div class="caption-cue clip" data-start="${cue.startSec.toFixed(3)}" data-duration="${cueDur}" data-accuracy="${cue.accuracy ?? "low"}" data-highlight-mode="${highlightMode||"accurate-only"}">
    ${cue.words.map((w) => {
      const wStart = (w.startMs / 1000).toFixed(3);
      const wDur = Math.max(0.05, (w.endMs - w.startMs) / 1000).toFixed(3);
      return `<span class="caption-word" data-word-start="${wStart}" data-word-duration="${wDur}"><span class="word-text">${escapeHtml(w.text)}</span><span class="word-highlight">${escapeHtml(w.text)}</span></span>`;
    }).join(" ")}
  </div>`;
  }).join("\n")}
</div>`;
}

// ── PERSISTENT SHELL ───────────────────────────────────────────────────────
function renderShell(metadata: Script["metadata"], tiktok: TiktokConfig, avatarRelPath: string = "tiktok-avatar.jpg"): string {
  const channel = escapeHtml(metadata.channel);
  const domain = escapeHtml(sourceLabel(metadata.source.domain));
  const handle = escapeHtml(tiktok.handle);
  return `
<!-- Shell: persistent brand elements (no data-start → always visible) -->
<div class="shell-bg"></div>

<div class="brand-shell-header">
  <img class="brand-icon" src="${escapeHtml(avatarRelPath)}" alt="${channel}" />
  <div class="brand-text">
    <div class="brand-name">${channel}</div>
  </div>
</div>

<div class="brand-shell-handle">
  <span class="handle-music">&#9835;</span>
  <span class="handle-text">${handle}</span>
</div>

<div class="brand-shell-keyword">
  <span>${escapeHtml(domain)}</span>
</div>

${VIGNETTE_HTML}
${GRAIN_OVERLAY_HTML}`.trim();
}

// ── SCENE DISPATCH ─────────────────────────────────────────────────────────
function renderScene(
  scene: Script["scenes"][number],
  start: number,
  duration: number,
  bgImageRelPath: string | null,
  tiktok: TiktokConfig,
  tiktokAvatarRelPath: string,
  mediaRecord?: MediaAssetRecord,
  visualStyle?: Script["visualStyle"],
  dynamic = false,
  channelLogoPath?: string,
  galleryRecords: (MediaAssetRecord|undefined)[] = [],
): string {
  const td = scene.templateData;

  let inner: string;
  let layoutName: string;

  switch (td.template) {
    case "data-flow":
      inner = `<div class="explainer-content semantic-content"><h2 class="explainer-title">${escapeHtml(td.title)}</h2><div class="semantic-flow">${td.nodes.map((node,i)=>`<div class="semantic-node"><span class="semantic-step">${String(i+1).padStart(2,'0')}</span><strong>${escapeHtml(node.label)}</strong><p>${escapeHtml(node.detail)}</p></div>${i<td.nodes.length-1?'<div class="semantic-link"><span>↓</span><i></i></div>':''}`).join('')}</div>${td.caption?`<p class="semantic-caption">${escapeHtml(td.caption)}</p>`:''}</div>`;
      layoutName="data-flow";break;
    case "worked-example":
      inner = `<div class="explainer-content semantic-content"><h2 class="explainer-title">${escapeHtml(td.title)}</h2><div class="example-label">${td.basis==='conceptual'?'MINH HỌA KHÁI NIỆM':'VÍ DỤ TRONG TÀI LIỆU · CHƯA CHẠY KIỂM CHỨNG'}</div><div class="example-card semantic-node"><span>INPUT</span><pre>${escapeHtml(td.input)}</pre></div><div class="example-operation semantic-node">${escapeHtml(td.operation)}</div><div class="example-card semantic-node"><span>OUTPUT</span><pre>${escapeHtml(td.output)}</pre></div></div>`;
      layoutName="worked-example";break;
    case "workflow":
      inner = `<div class="explainer-content"><h2 class="explainer-title">${escapeHtml(td.title)}</h2><div class="workflow-stack">${td.steps.map((step,i)=>`<div class="workflow-step"><span class="workflow-number">${String(i+1).padStart(2,'0')}</span><div><strong>${escapeHtml(step.label)}</strong><p>${escapeHtml(step.detail)}</p></div></div>${i<td.steps.length-1?'<div class="workflow-connector">↓</div>':''}`).join('')}</div></div>`;
      layoutName = "workflow";
      break;
    case "code-window":
      inner = `<div class="explainer-content"><h2 class="explainer-title">${escapeHtml(td.title)}</h2><div class="code-window"><div class="code-toolbar"><i></i><i></i><i></i><span>${escapeHtml(td.language)}</span></div><pre>${td.code.split('\n').map((line,i)=>`<span class="code-line${td.highlightLines?.includes(i+1)?" code-highlight":""}"><b>${i+1}</b><code>${escapeHtml(line)||' '}</code></span>`).join('')}</pre></div>${td.note?`<p class="code-note">${escapeHtml(td.note)}</p>`:''}</div>`;
      layoutName = "code-window";
      break;
    case "hook":
      inner = renderHookInner(td, bgImageRelPath, dynamic);
      layoutName = "hook";
      break;
    case "comparison":
      inner = renderComparisonInner(td);
      layoutName = "comparison";
      break;
    case "stat-hero":
      inner = renderStatHeroInner(td);
      layoutName = "stat-hero";
      break;
    case "feature-list":
      inner = renderFeatureListInner(td);
      layoutName = "feature-list";
      break;
    case "callout":
      inner = renderCalloutInner(td);
      layoutName = "callout";
      break;
    case "outro":
      inner = renderOutroInner(td, {...tiktok,displayName:td.channelName,handle:"@"+td.channelName.replace(/^@/,"")}, channelLogoPath);
      layoutName = "outro";
      break;
    case "spec-table":
      inner = renderSpecTableInner(td);
      layoutName = "spec-table";
      break;
    case "pros-cons":
      inner = renderProsConsInner(td);
      layoutName = "pros-cons";
      break;
    case "verdict-score":
      inner = renderVerdictScoreInner(td);
      layoutName = "verdict-score";
      break;
    case "price-tag":
      inner = renderPriceTagInner(td);
      layoutName = "price-tag";
      break;
    case "image-gallery":
      inner = renderImageGalleryInner(td,galleryRecords);
      layoutName = "image-gallery";
      break;
    case "phone-mockup":
      inner = renderPhoneMockupInner(td,mediaRecord);
      layoutName = "phone-mockup";
      break;
    default: {
      const _never: never = td;
      throw new Error(`Unknown template: ${(_never as any).template}`);
    }
  }

  if (dynamic && td.template === 'stat-hero') {
    const valueTag = '<div class="stat-value shimmer-sweep-target">';
    inner = inner.replace(valueTag + escapeHtml(td.value), valueTag + Array.from(td.value).map(c => `<span class="stat-digit">${escapeHtml(c)}</span>`).join(''));
    inner += '<div class="stat-orbit orbit-a"></div><div class="stat-orbit orbit-b"></div>';
  }
  if (dynamic && td.template === 'feature-list') {
    let index = 0;
    inner = inner.replace(/<div class="feat-dot"><\/div>/g, () => `<div class="feature-index">${String(++index).padStart(2,'0')}</div>`);
  }
  if (dynamic && td.template === 'outro') inner += '<div class="out-arrow">↗</div>';
  return buildScene(scene, start, duration, layoutName, inner, ['phone-mockup','image-gallery'].includes(td.template)?undefined:mediaRecord);
}

// ── HOOK SCENE ─────────────────────────────────────────────────────────────
function renderHookInner(td: Extract<TemplateDataType, { template: "hook" }>, bgImageRelPath: string | null, dynamic = false): string {
  // Background
  const hasImage = Boolean(td.bgSrc && bgImageRelPath);
  let bgHtml: string;
  if (hasImage) {
    // Ken Burns image
    const kbClass = td.kenBurns ?? "zoom-in";
    bgHtml = `<div class="bg kb-${kbClass}" style="background-image: url('${bgImageRelPath}')"></div>`;
  } else {
    bgHtml = `<div class="bg gradient-news-dark"></div>`;
  }
  // Only darken when there's a real photo to tame for text legibility —
  // our own gradient backgrounds are already tuned for contrast, and a flat
  // black scrim on top of them just muddies the theme's colors (esp. light-pro).
  const overlayHtml = hasImage ? `<div class="overlay" style="opacity: 0.55"></div>` : "";

  const tokens = td.headline.trim().split(/\s+/);
  const headline = dynamic ? tokens.map((word,i) => `<span class="hook-word${i >= tokens.length-2 ? ' word-accent' : ''}"><span class="hook-word-text">${escapeHtml(word)}</span>${i >= tokens.length-2 ? '<span class="word-swipe"></span>' : ''}</span>`).join(' ') : escapeHtml(td.headline);
  const subhead = td.subhead ? escapeHtml(td.subhead) : "";

  return `${bgHtml}
  ${overlayHtml}
  <div class="layout-hook">
    <div class="hook-headline shimmer-sweep-target">${headline}</div>
    ${subhead ? `<div class="hook-subhead">${subhead}</div>` : ""}
  </div>`;
}

// ── COMPARISON SCENE ───────────────────────────────────────────────────────
function renderComparisonInner(td: Extract<TemplateDataType, { template: "comparison" }>): string {
  const lColor = td.left.color;  // "cyan" | "purple"
  const rColor = td.right.color;
  const winnerClass = td.right.winner ? " card-winner" : "";

  return `
<div class="layout-comparison">
  <div class="cmp-card cmp-left color-${lColor}">
    <div class="cmp-label">${escapeHtml(td.left.label)}</div>
    <div class="cmp-value">${escapeHtml(td.left.value)}</div>
  </div>
  <div class="cmp-vs">VS</div>
  <div class="cmp-card cmp-right color-${rColor}${winnerClass}">
    <div class="cmp-label">${escapeHtml(td.right.label)}</div>
    <div class="cmp-value">${escapeHtml(td.right.value)}</div>
    ${td.right.winner ? '<div class="cmp-winner-badge">WINNER</div>' : ""}
  </div>
</div>`.trim();
}

// ── STAT HERO SCENE ────────────────────────────────────────────────────────
function renderStatHeroInner(td: Extract<TemplateDataType, { template: "stat-hero" }>): string {
  const context = td.context ? `<div class="stat-context">${escapeHtml(td.context)}</div>` : "";
  return `
<div class="layout-stat-hero">
  <div class="stat-value shimmer-sweep-target">${escapeHtml(td.value)}</div>
  <div class="stat-label">${escapeHtml(td.label)}</div>
  ${context}
</div>`.trim();
}

// ── FEATURE LIST SCENE ─────────────────────────────────────────────────────
function renderFeatureListInner(td: Extract<TemplateDataType, { template: "feature-list" }>): string {
  const bullets = td.bullets.map((b, i) =>
    `<div class="feat-bullet feat-bullet-${i}" data-idx="${i}">
      <div class="feat-dot"></div>
      <div class="feat-text">${escapeHtml(b)}</div>
    </div>`
  ).join("\n    ");

  return `
<div class="layout-feature-list">
  <div class="feat-card">
    <div class="feat-title">${escapeHtml(td.title)}</div>
    <div class="feat-rule"></div>
    <div class="feat-bullets">
      ${bullets}
    </div>
  </div>
</div>`.trim();
}

// ── CALLOUT SCENE ──────────────────────────────────────────────────────────
function renderCalloutInner(td: Extract<TemplateDataType, { template: "callout" }>): string {
  const tag = td.tag ? `<div class="callout-tag">${escapeHtml(td.tag)}</div>` : "";
  return `
<div class="layout-callout">
  <div class="callout-card">
    ${tag}
    <div class="callout-statement">${escapeHtml(td.statement)}</div>
  </div>
</div>`.trim();
}

// ── OUTRO SCENE ────────────────────────────────────────────────────────────
function renderOutroInner(
  td: Extract<TemplateDataType, { template: "outro" }>,
  tiktok: TiktokConfig,
  avatarRelPath: string | undefined,
  showCard = true,
): string {
  const ttCard = showCard ? renderTiktokCard(tiktok, avatarRelPath) : "";
  return `
<div class="layout-outro">
  <div class="out-cta-top">${escapeHtml(td.ctaTop)}</div>
  <div class="out-channel">${escapeHtml(td.channelName)}</div>
  <div class="out-underline"></div>
  <div class="out-source">Nguồn: ${escapeHtml(sourceLabel(td.source))}</div>
</div>
${ttCard}`.trim();
}

// ── SPEC TABLE SCENE (M3) ──────────────────────────────────────────────────
function renderSpecTableInner(td: Extract<TemplateDataType, { template: "spec-table" }>): string {
  return `
<div class="layout-spec-table">
  <div class="spec-header shimmer-sweep-target">${escapeHtml(td.productName)}</div>
  <div class="spec-subtitle">THÔNG SỐ KỸ THUẬT</div>
  <div class="spec-list">
    ${td.specs.map((s, idx) => `
    <div class="spec-row spec-row-${idx}">
      <span class="spec-label">${escapeHtml(s.label)}</span>
      <span class="spec-value">${escapeHtml(s.value)}</span>
    </div>`).join("\n    ")}
  </div>
</div>`.trim();
}

// ── PROS CONS SCENE (M3) ───────────────────────────────────────────────────
function renderProsConsInner(td: Extract<TemplateDataType, { template: "pros-cons" }>): string {
  const titleHtml = td.title ? `<div class="pros-cons-title">${escapeHtml(td.title)}</div>` : "";
  return `
<div class="layout-pros-cons">
  ${titleHtml}
  <div class="pros-cons-grid">
    <div class="pros-col">
      <div class="pros-header">✓ ƯU ĐIỂM</div>
      <div class="pros-list">
        ${td.pros.map((p, idx) => `
        <div class="pro-item pro-item-${idx}">
          <span class="pro-icon">✓</span>
          <span class="pro-text">${escapeHtml(p)}</span>
        </div>`).join("\n        ")}
      </div>
    </div>
    <div class="cons-col">
      <div class="cons-header">✕ NHƯỢC ĐIỂM</div>
      <div class="cons-list">
        ${td.cons.map((c, idx) => `
        <div class="con-item con-item-${idx}">
          <span class="con-icon">✕</span>
          <span class="con-text">${escapeHtml(c)}</span>
        </div>`).join("\n        ")}
      </div>
    </div>
  </div>
</div>`.trim();
}

// ── VERDICT SCORE SCENE (M3) ───────────────────────────────────────────────
function renderVerdictScoreInner(td: Extract<TemplateDataType, { template: "verdict-score" }>): string {
  const scaleText = td.scale === "100" ? "/100" : "/10";
  return `
<div class="layout-verdict-score">
  <div class="verdict-product">${escapeHtml(td.productName)}</div>
  <div class="verdict-score-badge shimmer-sweep-target">
    <span class="score-number">${td.score}</span>
    <span class="score-scale">${scaleText}</span>
  </div>
  <div class="verdict-tag">${escapeHtml(td.verdict)}</div>
  <div class="verdict-summary">${escapeHtml(td.summary)}</div>
</div>`.trim();
}

// ── PRICE TAG SCENE (M3) ───────────────────────────────────────────────────
function renderPriceTagInner(td: Extract<TemplateDataType, { template: "price-tag" }>): string {
  const variantHtml = td.variant ? `<div class="price-variant">${escapeHtml(td.variant)}</div>` : "";
  const noteHtml = td.note ? `<div class="price-note">${escapeHtml(td.note)}</div>` : "";
  return `
<div class="layout-price-tag">
  <div class="price-product">${escapeHtml(td.productName)}</div>
  ${variantHtml}
  <div class="price-hero-box shimmer-sweep-target">
    <div class="price-amount">${escapeHtml(td.price)}</div>
  </div>
  ${noteHtml}
</div>`.trim();
}

// ── IMAGE GALLERY SCENE (M3) ───────────────────────────────────────────────
function renderImageGalleryInner(td: Extract<TemplateDataType, { template: "image-gallery" }>,records:(MediaAssetRecord|undefined)[]): string {
  const titleHtml = td.title ? `<div class="gallery-title">${escapeHtml(td.title)}</div>` : "";
  return `
<div class="layout-image-gallery">
  ${titleHtml}
  <div class="gallery-items count-${td.images.length}">
    ${td.images.map((img, idx) => `
    <div class="gallery-card gallery-card-${idx}">
      ${records[idx]?`<img class="gallery-img" src="${escapeHtml(records[idx]!.localRelPath)}" alt="${escapeHtml(img.caption||td.title||'Ảnh minh họa')}" />`:'<div class="image-unavailable">Ảnh minh họa chưa sẵn sàng</div>'}
      ${img.caption ? `<div class="gallery-caption">${escapeHtml(img.caption)}</div>` : ""}
    </div>`).join("\n    ")}
  </div>
</div>`.trim();
}

// ── PHONE MOCKUP SCENE (M3) ────────────────────────────────────────────────
function renderPhoneMockupInner(td: Extract<TemplateDataType, { template: "phone-mockup" }>,record?:MediaAssetRecord): string {
  const titleHtml = td.title ? `<div class="mockup-title">${escapeHtml(td.title)}</div>` : "";
  const captionHtml = td.caption ? `<div class="mockup-caption">${escapeHtml(td.caption)}</div>` : "";
  const wide=record?.width&&record?.height&&record.width>record.height;
  const frameStyle=wide?` style="width:880px;height:${Math.max(300,Math.min(720,Math.round(880*record!.height!/record!.width!)))}px"`:'';
  return `
<div class="layout-phone-mockup">
  ${titleHtml}
  <div class="phone-frame${wide?' desktop-frame':''}${!record?' image-unavailable':''}"${frameStyle}>
    <div class="phone-island"></div>
    <div class="phone-screen">
      ${record?`<img class="phone-screen-img" src="${escapeHtml(record.localRelPath)}" alt="${escapeHtml(td.title||'Giao diện minh họa')}" />`:'<div class="image-unavailable">Ảnh minh họa chưa sẵn sàng</div>'}
    </div>
  </div>
  ${captionHtml}
  ${record?.credit?`<p class="mockup-source">${escapeHtml(sourceLabel(record.credit))}</p>`:''}
</div>`.trim();
}

/**
 * TikTok follow card — adapted from HyperFrames `tiktok-follow` block.
 * Slides up from bottom mid-outro. Animations are added by animations.js
 * targeting elements with id="tt-card", id="tt-follow-btn", etc.
 */
function renderTiktokCard(tiktok: TiktokConfig, avatarRelPath?: string): string {
  const followersHtml = tiktok.followers && tiktok.followers.trim() !== ""
    ? `\n    <div class="tt-followers">${escapeHtml(tiktok.followers)}</div>`
    : "";
  return `
<div id="tt-card" class="tt-card">
  ${avatarRelPath ? `<img class="tt-avatar tt-logo" src="${escapeHtml(avatarRelPath)}" alt="Logo ${escapeHtml(tiktok.displayName)}" />` : `<div class="tt-avatar tt-monogram" aria-label="Biểu tượng kênh">${escapeHtml(tiktok.displayName.slice(0,2).toUpperCase())}</div>`}
  <div class="tt-profile-info">
    <div class="tt-display-name">${escapeHtml(tiktok.displayName)}</div>
    <div class="tt-handle">${escapeHtml(tiktok.handle)}</div>${followersHtml}
  </div>
  <div id="tt-follow-btn" class="tt-follow-btn">
    <span id="tt-btn-follow" class="tt-btn-text">Follow</span>
    <span id="tt-btn-following" class="tt-btn-text tt-btn-text-following">
      <span>Đã theo dõi</span>
      <span class="tt-check-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>
    </span>
  </div>
  <span class="tt-click-ring" aria-hidden="true"></span>
  <svg class="tt-cursor" aria-hidden="true" viewBox="0 0 48 64"><path d="M5 3 L5 49 L17 38 L28 60 L38 55 L27 34 L44 33 Z" fill="#fff" stroke="#132333" stroke-width="4" stroke-linejoin="round"/></svg>
</div>`.trim();
}

// ── HELPERS ────────────────────────────────────────────────────────────────
function buildScene(
  scene: Script["scenes"][number],
  start: number,
  duration: number,
  layoutName: string,
  innerHtml: string,
  mediaRecord?: MediaAssetRecord,
): string {
  let mediaHtml = "";
  if (mediaRecord) {
    const fitClass = mediaRecord.fit === "contain" ? "fit-contain" : "fit-cover";
    const fxClass = mediaRecord.fx === "kenburns" ? "fx-kenburns" : "fx-none";
    if (mediaRecord.type === "video") {
      mediaHtml = `
  <div class="scene-media-wrapper">
    <video class="scene-media-video ${fitClass}" src="${escapeHtml(mediaRecord.localRelPath)}" autoplay muted loop playsinline></video>
    <div class="media-overlay"></div>
  </div>`;
    } else {
      mediaHtml = `
  <div class="scene-media-wrapper">
    <img class="scene-media-img ${fitClass} ${fxClass}" src="${escapeHtml(mediaRecord.localRelPath)}" alt="" />
    <div class="media-overlay"></div>
  </div>`;
    }
  }

  const presentation = mediaRecord?.presentation || 'background';
  if (mediaRecord && presentation !== 'background') {
    mediaHtml = `<div class="visual-asset visual-${presentation}"><div class="visual-browser-bar"><i></i><i></i><i></i><span>${escapeHtml(sourceLabel(mediaRecord.credit || mediaRecord.originalSrc || 'Tư liệu nguồn'))}</span></div><img src="${escapeHtml(mediaRecord.localRelPath)}" alt="Tư liệu minh họa" /></div>`;
  }
  const creditHtml = mediaRecord?.credit && !['card','logo'].includes(mediaRecord.presentation || 'background')
    ? `<div class="media-credit-badge">Nguồn: ${escapeHtml(sourceLabel(mediaRecord.credit))}</div>`
    : "";

  const transType = scene.transition?.type || "cut";
  const transDur = scene.transition?.duration ?? 0.3;

  return `
<div class="scene clip" id="scene-${scene.id}"
     data-start="${start.toFixed(2)}" data-duration="${duration.toFixed(2)}" data-active="0"
     data-layout="${layoutName}" data-media="${presentation}"
     data-transition="${transType}"
     data-transition-duration="${transDur.toFixed(2)}">
  ${mediaHtml}
  ${innerHtml}
  ${creditHtml}
</div>`.trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
