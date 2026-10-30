import {ExplanationLevelSchema} from '../studio/explanation-level.js';
import {CreativeOptions,BlockTiming} from './reference-design.js';
import { z } from "zod";
import { PACK_IDS } from "./style-packs.js";
import {DEFAULT_BGM} from '../channel-defaults.js';

// ── Template data shapes (discriminated by template field) ─────────────────

const HookData = z.object({
  template: z.literal("hook"),
  headline: z.string().min(1).max(40),
  subhead: z.string().max(40).optional(),
  /** Product identity is separate from the spoken problem/solution hook. */
  hero: z.object({
    name:z.string().min(1).max(40), category:z.string().max(32).optional(),
    repository:z.string().max(50).optional(), before:z.string().max(40).optional(), after:z.string().max(40).optional(),
  }).optional(),
  /** background image path (literal "$source.image" → substituted at pipeline level) */
  bgSrc: z.string().optional(),
  /** Ken Burns effect class */
  kenBurns: z.enum(["zoom-in", "zoom-out", "pan-left", "pan-right"]).default("zoom-in"),
});

const ComparisonSide = z.object({
  label: z.string().min(1).max(30),
  value: z.string().min(1).max(20),
  color: z.enum(["cyan", "purple"]),
});

const ComparisonData = z.object({
  template: z.literal("comparison"),
  left: ComparisonSide,
  right: ComparisonSide.extend({ winner: z.boolean().optional() }),
});

const StatHeroData = z.object({
  template: z.literal("stat-hero"),
  value: z.string().min(1).max(20),
  label: z.string().min(1).max(40),
  context: z.string().max(50).optional(),
});

const FeatureListData = z.object({
  template: z.literal("feature-list"),
  title: z.string().min(1).max(40),
  bullets: z.array(z.string().min(1).max(50)).min(1).max(4),
  icon: z.string().optional(),
});

const CalloutData = z.object({
  template: z.literal("callout"),
  statement: z.string().min(1).max(80),
  tag: z.string().max(20).optional(),
});

const OutroData = z.object({
  template: z.literal("outro"),
  ctaTop: z.string().min(1).max(30),
  channelName: z.string().min(1).max(30),
  source: z.string().min(1).max(40),
});

// ── Review Templates (M3) ──────────────────────────────────────────────────
const SpecItem = z.object({
  label: z.string().min(1).max(30),
  value: z.string().min(1).max(40),
});

const SpecTableData = z.object({
  template: z.literal("spec-table"),
  productName: z.string().min(1).max(40),
  specs: z.array(SpecItem).min(1).max(6),
});

const ProsConsData = z.object({
  template: z.literal("pros-cons"),
  title: z.string().min(1).max(40).optional(),
  pros: z.array(z.string().min(1).max(50)).min(1).max(4),
  cons: z.array(z.string().min(1).max(50)).min(1).max(4),
});

const VerdictScoreData = z.object({
  template: z.literal("verdict-score"),
  productName: z.string().min(1).max(40),
  score: z.number().min(0).max(100),
  scale: z.enum(["10", "100"]).default("10"),
  verdict: z.string().min(1).max(30),
  summary: z.string().min(1).max(80),
});

const PriceTagData = z.object({
  template: z.literal("price-tag"),
  productName: z.string().min(1).max(40),
  price: z.string().min(1).max(30),
  variant: z.string().max(40).optional(),
  note: z.string().max(50).optional(),
});

const GalleryImage = z.object({
  src: z.string().min(1),
  caption: z.string().max(40).optional(),
});

const ImageGalleryData = z.object({
  template: z.literal("image-gallery"),
  title: z.string().min(1).max(40).optional(),
  images: z.array(GalleryImage).min(1).max(3),
});

const PhoneMockupData = z.object({
  template: z.literal("phone-mockup"),
  title: z.string().min(1).max(40).optional(),
  screenSrc: z.string().min(1),
  caption: z.string().max(50).optional(),
});

const WorkflowData = z.object({
  template: z.literal("workflow"), title: z.string().min(1).max(40),
  steps: z.array(z.object({ label: z.string().min(1).max(24), detail: z.string().max(60) })).min(2).max(4),
});
const DataFlowData = z.object({
  template: z.literal("data-flow"), title: z.string().min(1).max(40),
  nodes: z.array(z.object({label:z.string().min(1).max(24),detail:z.string().max(65)})).min(2).max(4),
  caption: z.string().max(90).optional(),
});
const ExampleData = z.object({
  template: z.literal("worked-example"), title:z.string().min(1).max(40),
  input:z.string().min(1).max(180), operation:z.string().min(1).max(65), output:z.string().min(1).max(180),
  basis:z.enum(["conceptual","source-example"]),
});
const CodeWindowData = z.object({
  template: z.literal("code-window"), title: z.string().min(1).max(40), language: z.string().max(20),
  highlightLines: z.array(z.number().int().min(1).max(10)).max(10).optional(),
  code: z.string().min(1).max(600).refine(s => s.split("\n").length <= 10, "Code tối đa 10 dòng"), note: z.string().max(70).optional(),
});

export const TemplateData = z.discriminatedUnion("template", [
  DataFlowData,
  ExampleData,
  WorkflowData,
  CodeWindowData,
  HookData,
  ComparisonData,
  StatHeroData,
  FeatureListData,
  CalloutData,
  OutroData,
  SpecTableData,
  ProsConsData,
  VerdictScoreData,
  PriceTagData,
  ImageGalleryData,
  PhoneMockupData,
]);

export type TemplateDataType = z.infer<typeof TemplateData>;

// ── SFX schema ─────────────────────────────────────────────────────────────
/**
 * Per-scene sound effect override. If omitted, the pipeline picks a default
 * SFX based on the template type (see SKILL.md / pipeline DEFAULT_SFX).
 *
 * `name` examples: "transition/whoosh-soft", "emphasis/ding", "alert/notification"
 *   → resolves to assets/sfx/<name>.mp3
 * Set `name: "none"` to explicitly disable SFX for this scene.
 */
const SfxSpec = z.object({
  name: z.string().min(1),
  /** Volume 0–1, default 0.4 (so SFX doesn't drown the voice) */
  volume: z.number().min(0).max(1).default(0.4),
  /** Seconds offset from scene start (default 0). Negative = before scene. */
  startOffsetSec: z.number().default(0),
});

export type SfxSpecType = z.infer<typeof SfxSpec>;

// ── Media schema (M2) ──────────────────────────────────────────────────────
export const MediaSpec = z.object({
  type: z.enum(["image", "video", "screenshot"]),
  src: z.string().min(1),
  fit: z.enum(["cover", "contain"]).default("cover"),
  fx: z.enum(["none", "kenburns"]).default("kenburns"),
  presentation: z.enum(["background", "card", "logo"]).optional(),
  credit: z.string().optional(),
  license: z.string().optional(),
});

export type MediaSpecType = z.infer<typeof MediaSpec>;

// ── Transition schema (M5) ─────────────────────────────────────────────────
export const TransitionSpec = z.object({
  type: z.enum(["cut", "fade", "slide", "zoom"]).default("cut"),
  duration: z.number().min(0).max(2).default(0.3),
});
export type TransitionSpecType = z.infer<typeof TransitionSpec>;

// ── BGM schema (M5) ────────────────────────────────────────────────────────
export const BgmSpec = z.object({
  enabled: z.boolean().optional(),
  src: z.string().min(1).default(DEFAULT_BGM.src),
  volume: z.number().min(0).max(1).optional().default(DEFAULT_BGM.volume),
  duck: z.boolean().optional().default(true),
  duckVolume: z.number().min(0).max(1).optional().default(0.06),
});
export type BgmSpecType = z.infer<typeof BgmSpec>;

// ── Scene schema ───────────────────────────────────────────────────────────

export const Scene = z.object({
  id: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/, "ID cảnh chỉ gồm chữ, số, gạch ngang và gạch dưới"),
  type: z.enum(["hook", "body", "outro"]),
  voiceText: z.string().min(1),
  githubHookStyle:z.enum(['compact','identity-only']).optional(),
  githubStarSpokenPrefix:z.string().max(200).optional(),
  githubStarLeadIn:z.boolean().optional(),
  blockTiming: BlockTiming.optional(),
  /** Extra source-backed blocks accumulate beneath a reference board. */
  referenceBoard:z.object({
    rows:z.array(z.object({title:z.string().min(1).max(40),detail:z.string().max(65),tone:z.enum(['mint','red','blue','gold','violet']).optional(),badge:z.string().max(12).optional(),disabled:z.boolean().optional()})).max(3).optional(),
    cards:z.array(z.object({label:z.string().max(40),value:z.string().min(1).max(40),detail:z.string().max(65).optional(),tone:z.enum(['mint','red','blue','gold','violet']).optional()})).max(2).optional(),
  }).optional(),
  storyboard: z.object({
    assetId:z.string().uuid().optional(),
    intent:z.string().min(1).max(180), visualBrief:z.string().min(1).max(240),
    basis:z.enum(["conceptual","source-example","source-asset"]),
    evidence:z.string().min(1).max(280),
    transitionReason:z.string().min(1).max(160),
    status:z.enum(["source-matched","needs-review"]).optional(),
  }).optional(),
  templateData: TemplateData,
  /** Optional sound effect override (else pipeline picks per template) */
  sfx: SfxSpec.optional(),
  /** Optional media asset (image/video/screenshot) for this scene (M2) */
  media: MediaSpec.optional(),
  /** Optional scene transition (cut, fade, slide, zoom) (M5) */
  transition: TransitionSpec.optional(),
});
export type SceneType = z.infer<typeof Scene>;

// ── Caption schema (M1) ────────────────────────────────────────────────────
export const CaptionOptions = z.object({
  highlightMode:z.enum(["accurate-only","estimated"]).optional(),
  enabled: z.boolean().default(true),
  style: z.enum(["tiktok-bold", "classic-sub", "minimal"]).default("tiktok-bold"),
});

export type CaptionOptionsType = z.infer<typeof CaptionOptions>;

// ── Timeline schema (M6) ───────────────────────────────────────────────────
export const TimelineSceneTiming = z.object({
  start: z.number().min(0).optional(),
  duration: z.number().min(0.1).optional(),
  trimIn: z.number().min(0).optional(),
  trimOut: z.number().min(0).optional(),
});
export type TimelineSceneTimingType = z.infer<typeof TimelineSceneTiming>;

export const TimelineCaptionCue = z.object({
  start: z.number().min(0),
  end: z.number().min(0),
  text: z.string(),
});
export type TimelineCaptionCueType = z.infer<typeof TimelineCaptionCue>;

export const TimelineSpec = z.object({
  scenes: z.record(z.string(), TimelineSceneTiming).optional(),
  captionCues: z.array(TimelineCaptionCue).optional(),
});
export type TimelineSpecType = z.infer<typeof TimelineSpec>;

// ── Root schema ────────────────────────────────────────────────────────────

export const ScriptSchema = z.object({
  creative: CreativeOptions.optional(),
  templatePack: z.enum(PACK_IDS).optional(),
  directingMode: z.literal("auto").optional(),
  renderSettings:z.object({quality:z.enum(['draft','standard','high']).optional(),fps:z.union([z.literal(24),z.literal(30),z.literal(60)]).optional(),workers:z.union([z.literal(1),z.literal(2),z.literal(4)]).optional()}).optional(),
  explanationLevel: ExplanationLevelSchema.optional(),
  fitDuration: z.boolean().optional(),
  narrationTiming: z.object({targetSec:z.number().positive(),speechSec:z.number().positive(),tempo:z.number().positive(),hookSec:z.number().positive(),attempts:z.number().int().positive()}).optional(),
  contentMode: z.enum(["overview", "deep-dive"]).optional(),
  targetDurationSec: z.number().positive().max(180).optional(),
  coverage: z.object({
    items: z.array(z.object({topic:z.enum(["purpose","features","usage","requirements","limitations","examples"]),status:z.enum(["covered","not-in-source","deferred","needs-review"]),summary:z.string().min(1).max(240),evidence:z.string().max(280).optional(),sceneIds:z.array(z.string()).max(24)})).min(6).max(6),
    omittedTopics:z.array(z.string().max(180)).max(12),
    warnings:z.array(z.string().max(240)).max(12).optional(),
  }).optional(),
  visualStyle: z.enum(["classic", "tech-editorial"]).optional(),
  motionPreset: z.enum(["calm", "dynamic"]).optional(),
  soundDesign: z.boolean().optional(),
  colorTheme: z.enum(["teal", "midnight"]).optional(),
  generation: z.object({ mode: z.enum(["ai", "source-only", "imported"]), message: z.string().optional() }).optional(),
  hookSuggestions: z.array(z.object({ label: z.string(), headline: z.string().max(40), subhead: z.string().max(40), voiceText: z.string() })).max(4).optional(),
  version: z.string().optional(),
  schemaVersion: z.union([z.literal(1), z.literal(2)]).optional(),
  captions: CaptionOptions.optional(),
  bgm: BgmSpec.optional(),
  preset: z.enum(["short_30", "news_45", "review_60"]).optional(),
  timeline: TimelineSpec.optional(),
  metadata: z.object({
    githubStars:z.object({repoUrl:z.url(),count:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),fetchedAt:z.iso.datetime()}).optional(),
    title: z.string().min(1),
    logoAssetId: z.string().uuid().optional(),
    source: z.object({
      url: z.string(),
      domain: z.string(),
      image: z.string().url().nullable(),
    }),
    channel: z.string().min(1),
    /** Explicit flag to allow using og:image (default false) */
    useOgImage: z.boolean().optional(),
    /** Editor preview guide only; never included in video exports. */
    safeZoneOverlay: z.boolean().optional(),
  }),
  voice: z.object({
    provider: z.string().min(1),
    voiceId: z.string().min(1),
    speed: z.number().min(0.5).max(2.0),
    settingsSource: z.literal("script").optional(),
    pronunciation: z.enum(["original", "lexicon", "smart"]).optional(),
    pronunciationOverrides: z.record(z.string().min(1).max(100),z.string().min(1).max(200)).refine(d=>Object.keys(d).length<=80,"Tối đa 80 từ phát âm riêng").optional(),
    uploadId: z.string().uuid().optional(),
    captionsSrt: z.string().max(100000).optional(),
    sceneBoundaries: z.array(z.number().positive()).max(23).optional(),
  }),
  scenes: z
    .array(Scene)
    .min(2)
    .refine(s => new Set(s.map(scene => scene.id)).size === s.length, "ID cảnh không được trùng nhau")
    .max(24, "scenes must have at most 24 items")
    .refine(
      (s) => s[0]?.type === "hook",
      { message: "scenes[0] must be type=hook" }
    )
    .refine(
      (s) => s[s.length - 1]?.type === "outro",
      { message: "last scene must be type=outro" }
    ),
}).superRefine((script,ctx)=>{
  if(!script.explanationLevel&&script.targetDurationSec!==undefined&&(!Number.isInteger(script.targetDurationSec)||script.targetDurationSec<30))ctx.addIssue({code:"custom",path:["targetDurationSec"],message:"Legacy targetDurationSec phải là số nguyên từ 30 đến 180."});
  if(!script.directingMode && script.scenes.length<5)ctx.addIssue({code:"custom",path:["scenes"],message:"Legacy scripts need at least 5 scenes."});
  if(!script.directingMode && script.scenes.length>16)ctx.addIssue({code:"custom",path:["scenes"],message:"Legacy deep-dive allows at most 16 scenes."});
  if(!script.directingMode && script.contentMode!=="deep-dive" && script.scenes.length>8)ctx.addIssue({code:'custom',path:['scenes'],message:'Legacy/overview scripts must have at most 8 scenes; choose deep-dive to extend.'});
});

export type Script = z.infer<typeof ScriptSchema>;
