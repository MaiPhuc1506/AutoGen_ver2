import {NarrationAudioError} from './script/measured-hook.js';
import {fetchSourceContent} from './script/source-fetcher.js';
import {SourceAccessError} from './script/platform-source.js';
import {createRadar,filterRadar,RADAR_CATEGORIES} from './ingest/radar.js';
import {EXPLANATION_LEVELS} from './studio/explanation-level.js';
import {ensureRepositoryHero} from './studio/repository-hero.js';
import {measureNarration} from './studio/narration-timing.js';
import {DEFAULT_VOICE} from './channel-defaults.js';
import {mergePronunciationOverrides} from './tts/lexicon.js';
import {hydrateGithubStars,applySpokenGithubHook} from './script/github-stars.js';
import {applyReferenceDefaults,CreativeOptions} from './render/reference-design.js';
import {z} from "zod";
import {defaultCaption} from './channel-defaults.js';
import {ensureVideoThumbnail} from './ingest/thumbnail.js';
import {assignAutomaticVisuals} from './studio/visual-policy.js';
import {readVisual} from "./studio/visuals.js";
import { stylePack } from "./render/style-packs.js";
import express, { Request, Response } from "express";
import { config } from "dotenv";
config({ path: ".env.local" });

import { readdir, readFile, writeFile, mkdir, stat, rm } from "node:fs/promises";
import { existsSync, createReadStream } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import axios from "axios";
import { randomUUID } from "node:crypto";
import { buildHookSuggestions } from "./script/hooks.js";
import { normalizeVietnameseForTts } from "./utils/script-generator.js";
import { studioRouter } from "./studio/routes.js";
import { voiceConfig, studioTts, cachedSpeech } from "./studio/voice.js";
import { readUpload, importedCues, importedBoundaries, assignImportedNarration } from "./studio/uploads.js";
import { runPipeline } from "./pipeline.js";
import { loadConfig } from "./config.js";
import { toSlug } from "./utils/slug.js";
import { generateScriptFromContent } from "./utils/script-generator.js";
import { generateScript } from "./script/generator.js";
import { createLlmProvider } from "./script/llm-provider.js";
import type { LLMProvider } from "./script/types.js";
import { addLogListener, log } from "./utils/logger.js";
import { ScriptSchema, type Script } from "./render/script-schema.js";
import {
  migrateV1toV2,
  buildTimelineState,
  timelineStateToScript,
} from "./timeline/index.js";
import { getDurationSec, concatWithSilence } from "./assets/audio-tools.js";
import { createTtsClient } from "./tts/index.js";
import { applyLexicon, resetLexiconCache, validateLexicon } from "./tts/lexicon.js";
import { loadFeedsConfig, fetchFeedItems } from "./ingest/feed-collector.js";
import { BatchQueue } from "./ingest/batch-queue.js";
import { generatePublishChecklist } from "./ingest/publish-kit.js";
import { parseSrt, generateSrt } from "./captions/srt.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const PUBLIC_DIR = join(PROJECT_ROOT, "public");
const OUTPUT_DIR = join(PROJECT_ROOT, "output");

export const app = express();
app.use(express.json({ limit: "10mb" }));
app.use("/api/studio", studioRouter);
app.use(
  express.static(PUBLIC_DIR, {
    etag: false,
    maxAge: 0,
    setHeaders: (res) => {
      res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");
    },
  })
);

interface Job {
  id: string;
  slug: string;
  outputDir: string;
  status: "running" | "completed" | "failed";
  step: number;
  totalSteps: number;
  stepMessage: string;
  logs: string[];
  error?: string;
  videoUrl?: string;
  caption?: string;
  clients: Response[];
}

const jobs = new Map<string, Job>();

// Broadcast SSE event
function broadcastToJob(job: Job, event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of job.clients) {
    try {
      client.write(payload);
    } catch {
      // client disconnected
    }
  }
}

// Hook global logger
addLogListener((entry) => {
  for (const job of jobs.values()) {
    if (job.status === "running") {
      const line = `[${entry.timestamp}] ${entry.step ? `[${entry.step}/${entry.total}] ` : ""}${entry.msg}`;
      job.logs.push(line);
      if (entry.step) {
        job.step = entry.step;
        job.totalSteps = entry.total || 8;
        job.stepMessage = entry.msg;
      }
      broadcastToJob(job, "progress", {
        step: job.step,
        totalSteps: job.totalSteps,
        stepMessage: job.stepMessage,
        log: line,
      });
    }
  }
});

// ── API: Config ─────────────────────────────────────────────────────────────
app.get("/api/config", (req, res) => {
  try {
    const cfg = loadConfig();
    res.json({
      ttsProvider: cfg.ttsProvider,
      edgeTtsVoice: cfg.edgeTtsVoice,
      edgeTtsVoices: [
        { id: "vi-VN-NamMinhNeural", label: "Nam Minh (Nam - Giọng chuẩn miền Bắc)", gender: "Nam" },
        { id: "vi-VN-HoaiMyNeural", label: "Hoài My (Nữ - Giọng chuẩn miền Bắc)", gender: "Nữ" },
      ],
      providers: [
        { id: "zerotts", name: "ZeroTTS (Local · không cần API key)", free: true },
        { id: "edge-tts", name: "Microsoft Edge TTS (Miễn phí 100%, 0đ)", free: true },
        { id: "lucylab", name: "LucyLab Voice Clone", free: false },
        { id: "vbee", name: "Vbee Báo chí", free: false },
        { id: "elevenlabs", name: "ElevenLabs Studio", free: false },
      ],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── LLM Configuration Helper (M4) ───────────────────────────────────────────
interface StoredLlmConfig {
  provider: string; // "gemini" | "openai" | "anthropic" | "custom" | "offline"
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

const LLM_CONFIG_FILE = join(PROJECT_ROOT, "config", "llm.json");

async function loadLlmConfig(): Promise<StoredLlmConfig> {
  if (existsSync(LLM_CONFIG_FILE)) {
    try {
      const data = JSON.parse(await readFile(LLM_CONFIG_FILE, "utf-8"));
      return {
        provider: data.provider || "gemini",
        model: data.model || "gemini-2.0-flash",
        apiKey: data.apiKey || "",
        baseUrl: data.baseUrl || "",
      };
    } catch {}
  }
  return {
    provider: process.env.LLM_PROVIDER || (process.env.GEMINI_API_KEY ? "gemini" : (process.env.OPENAI_API_KEY ? "openai" : "gemini")),
    model: process.env.LLM_MODEL || (process.env.OPENAI_API_KEY ? "gpt-4o-mini" : "gemini-2.0-flash"),
    apiKey: process.env.GEMINI_API_KEY || process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || "",
    baseUrl: process.env.LLM_BASE_URL || "",
  };
}

function getMaskedKey(key?: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

async function getEffectiveLlmProvider(): Promise<{
  provider: LLMProvider | null;
  info: { provider: string; model: string };
}> {
  const cfg = await loadLlmConfig();
  if (cfg.provider === "offline" || !cfg.apiKey) {
    return { provider: null, info: { provider: cfg.provider, model: cfg.model } };
  }
  try {
    const llm = createLlmProvider({
      provider: cfg.provider,
      apiKey: cfg.apiKey,
      model: cfg.model,
      baseUrl: cfg.baseUrl,
    });
    return { provider: llm, info: { provider: cfg.provider, model: cfg.model } };
  } catch (err: any) {
    log.warn(`[Server] Không thể khởi tạo LLM Provider ${cfg.provider}: ${err.message}`);
    return { provider: null, info: { provider: cfg.provider, model: cfg.model } };
  }
}

// ── API: LLM Settings (GET/POST/TEST) ────────────────────────────────────────
app.get("/api/llm/config", async (_req, res) => {
  try {
    const cfg = await loadLlmConfig();
    const hasKey = Boolean(cfg.apiKey && cfg.apiKey.trim().length > 0);
    res.json({
      provider: cfg.provider,
      model: cfg.model,
      baseUrl: cfg.baseUrl || "",
      hasApiKey: hasKey,
      maskedApiKey: getMaskedKey(cfg.apiKey),
      status: cfg.provider === "offline" ? "offline" : (hasKey ? "ready" : "no_key"),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/llm/config", async (req, res) => {
  try {
    const { provider, apiKey, model, baseUrl } = req.body;
    const current = await loadLlmConfig();

    let newApiKey = current.apiKey;
    if (apiKey !== undefined && apiKey !== null) {
      const trimmed = apiKey.trim();
      if (trimmed && !trimmed.includes("••••") && !trimmed.includes("...")) {
        newApiKey = trimmed;
      } else if (trimmed === "") {
        newApiKey = "";
      }
    }

    const updated: StoredLlmConfig = {
      provider: provider || current.provider || "gemini",
      model: model || current.model || "gemini-2.0-flash",
      apiKey: newApiKey,
      baseUrl: baseUrl !== undefined ? baseUrl.trim() : current.baseUrl,
    };

    // Ensure config directory exists
    const configDir = join(PROJECT_ROOT, "config");
    await mkdir(configDir, { recursive: true });
    await writeFile(LLM_CONFIG_FILE, JSON.stringify(updated, null, 2), "utf-8");

    // Sync to active process env
    process.env.LLM_PROVIDER = updated.provider;
    process.env.LLM_MODEL = updated.model;
    if (updated.apiKey) {
      process.env.LLM_API_KEY = updated.apiKey;
      if (updated.provider === "gemini") process.env.GEMINI_API_KEY = updated.apiKey;
      if (updated.provider === "openai") process.env.OPENAI_API_KEY = updated.apiKey;
      if (updated.provider === "anthropic") process.env.ANTHROPIC_API_KEY = updated.apiKey;
    }
    if (updated.baseUrl) process.env.LLM_BASE_URL = updated.baseUrl;

    res.json({
      success: true,
      provider: updated.provider,
      model: updated.model,
      baseUrl: updated.baseUrl || "",
      hasApiKey: Boolean(updated.apiKey),
      maskedApiKey: getMaskedKey(updated.apiKey),
      status: updated.provider === "offline" ? "offline" : (updated.apiKey ? "ready" : "no_key"),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/llm/test", async (req, res) => {
  try {
    const { provider, apiKey, model, baseUrl } = req.body;
    const current = await loadLlmConfig();

    let testApiKey = current.apiKey;
    if (apiKey && typeof apiKey === "string") {
      const trimmed = apiKey.trim();
      if (trimmed && !trimmed.includes("••••") && !trimmed.includes("...")) {
        testApiKey = trimmed;
      }
    }

    const targetProvider = provider || current.provider || "gemini";
    const targetModel = model || current.model || "gemini-2.0-flash";
    const targetBaseUrl = baseUrl !== undefined ? baseUrl : current.baseUrl;

    if (targetProvider === "offline") {
      return res.json({
        success: true,
        latencyMs: 1,
        message: "Chế độ Offline Generator sẵn sàng (không gọi API ngoài)",
      });
    }

    if (!testApiKey) {
      return res.status(400).json({
        success: false,
        error: "Chưa nhập API Key cho Provider này!",
      });
    }

    const llm = createLlmProvider({
      provider: targetProvider,
      apiKey: testApiKey,
      model: targetModel,
      baseUrl: targetBaseUrl,
    });

    const start = Date.now();
    const reply = await llm.generate(
      "You are a helpful test assistant.",
      "Respond strictly with the single word: OK",
    );
    const latencyMs = Date.now() - start;

    res.json({
      success: true,
      latencyMs,
      message: `Kết nối thành công (${latencyMs}ms)! AI phản hồi: "${reply.trim().slice(0, 50)}"`,
      model: targetModel,
      provider: targetProvider,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: err.message || "Lỗi không xác định khi kết nối LLM API",
    });
  }
});

// ── API: Extract URL ─────────────────────────────────────────────────────────
app.post("/api/extract-url", async (req, res) => {
  const parsed=z.object({url:z.string().url().max(2048).regex(/^https?:\/\//i)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'URL HTTP(S) không hợp lệ.'});
  try{
    const source=await fetchSourceContent(parsed.data.url);
    res.json({...source,paragraphCount:source.content.split(/\n\s*\n/).length});
  }catch(error){res.status(error instanceof SourceAccessError?error.status:422).json({error:error instanceof Error?error.message:'Không thể đọc URL.'});}
});

const radar=createRadar();
app.get('/api/radar',async(req,res)=>{
 const query=z.object({source:z.string().max(80).optional(),category:z.enum(RADAR_CATEGORIES).optional(),sort:z.enum(['newest','trending']).optional(),q:z.string().max(200).optional()}).safeParse(req.query);
 if(!query.success)return res.status(400).json({error:'Bộ lọc Radar không hợp lệ.'});
 try{res.json(filterRadar(await radar.snapshot(),query.data));}catch{res.status(503).json({error:'Không thể tải Radar. Vui lòng thử lại.'});}
});

// ── API: Generate Script ────────────────────────────────────────────────────
app.post("/api/generate-script", async (req, res) => {
  try {
    const { title, content, url, domain, image, channel, voiceProvider, voiceId, speed, preset } = req.body;
    if (!title) return res.status(400).json({ error: "Tiêu đề không được để trống" });
    if (req.body.voice) {
      const voice = ScriptSchema.shape.voice.parse(req.body.voice);
      if (voice.uploadId) await readUpload(voice.uploadId);
      else voiceConfig(voice);
    }


    const creative=CreativeOptions.parse(req.body.creative||{});
    const directingMode=ScriptSchema.shape.directingMode.parse(req.body.directingMode);
    const visualIds=z.array(z.string().uuid()).max(20).parse(req.body.visualAssetIds||[]);
    const visualAssets=await Promise.all(visualIds.map(id=>readVisual(id)));
    const fitDuration=ScriptSchema.shape.fitDuration.parse(req.body.fitDuration);
    const explanationLevel=ScriptSchema.shape.explanationLevel.parse(req.body.explanationLevel);
    const contentMode=explanationLevel?(explanationLevel==='quick'?'overview':'deep-dive'):req.body.contentMode===undefined?undefined:ScriptSchema.shape.contentMode.parse(req.body.contentMode);
    const targetDurationSec=explanationLevel?EXPLANATION_LEVELS[explanationLevel].preferredSec:req.body.targetDurationSec===undefined?undefined:ScriptSchema.shape.targetDurationSec.parse(req.body.targetDurationSec);
    const templatePack=req.body.templatePack===undefined?undefined:ScriptSchema.shape.templatePack.parse(req.body.templatePack);
    const { provider: llmInstance, info: llmInfo } = await getEffectiveLlmProvider();

    let script: Script | null = null;
    let usedAi = false;
    if (llmInstance && !req.body.voice?.uploadId) {
      try {
        log.info(`[Server] Generating script with configured LLM (${llmInfo.provider} / ${llmInfo.model})...`);
        const llmPreset = preset === "review_60" ? "review_60" : "news_short";
        const result = await generateScript({
          input: content ? `${title}\n\n${content}` : url || title,
          preset: llmPreset,
          voice:req.body.voice?ScriptSchema.shape.voice.parse(req.body.voice):{...DEFAULT_VOICE},
          measureNarration:targetDurationSec?measureNarration:undefined,
          creative, explanationLevel, contentMode, targetDurationSec, directingMode, visualAssets:visualAssets.map(({id,label,source,kind})=>({id,label,source,kind})),
          source: content ? {title,content,url:url||'manual',domain:domain||'manual',ogImage:image||null} : undefined,
          channelName: channel || "DevPeek36",
          llmProvider: llmInstance,
        });
        script = result.script;
        usedAi = true;
        script.metadata.source = { url: url || "local", domain: domain || "local", image: image || null };
      } catch (err: any) {
        if(err instanceof NarrationAudioError){log.warn(err.message);return res.status(503).json({error:err.message,stage:"voice",retryable:true});}
        log.warn(`LLM script generation failed (${err.message})`);
        return res.status(502).json({ error: `AI chưa tạo được kịch bản hợp lệ. Hệ thống đã tự thử sửa; chưa có bản đạt yêu cầu nên chưa chuyển sang render. Chi tiết: ${err.message}` });
      }
    }

    if (!script) {
      script = await generateScriptFromContent({
        title,
        content: content || title,
        url,
        domain,
        image,
        channel: channel || "DevPeek36",
        voiceProvider,
        voiceId,
        speed,
      });
    }

    script.generation = {
      mode: req.body.voice?.uploadId ? 'imported' : usedAi ? 'ai' : 'source-only',
      message: req.body.voice?.uploadId ? 'Giữ nguyên lời đọc của audio bạn tải lên.' : usedAi
        ? script.narrationTiming ? 'Đã tự biên tập hook, đo lời đọc và cân thời lượng. Bạn có thể xuất hoặc chỉnh thêm nếu muốn.' : 'Kịch bản được tạo bằng AI; có thể xem lại thông tin theo nguồn.'
        : 'Đang dựng từ câu có trong nguồn. Chưa dùng AI để biên tập hook; có thể bật AI trong Cấu hình LLM.'
    };
    if (!req.body.voice?.uploadId) {
      const alternatives = usedAi ? (script.hookSuggestions || []) : buildHookSuggestions(title, content || title,creative.hookType||'problem-solution').map(h => ({ ...h, voiceText: normalizeVietnameseForTts(h.voiceText) }));
      const current = script.scenes[0];
      if(!usedAi&&alternatives[0]&&current.templateData.template==='hook'){
        current.voiceText=alternatives[0].voiceText;current.templateData.headline=alternatives[0].headline;current.templateData.subhead=alternatives[0].subhead;
      }
      script.hookSuggestions = current.templateData.template === 'hook'
        ? [{ label: usedAi ? 'Hook AI đã chọn' : 'Hook đang dùng', headline: current.templateData.headline,
            subhead: current.templateData.subhead || '', voiceText: current.voiceText }, ...alternatives.filter(h=>h.voiceText!==current.voiceText)].slice(0,4)
        : alternatives;
    }
    if(directingMode && usedAi){
      script.directingMode=directingMode;
    }
    assignAutomaticVisuals(script,visualAssets);
    await ensureRepositoryHero(script,visualAssets);
    if((fitDuration || script.narrationTiming) && !script.voice.uploadId)script.fitDuration=true;
    if (contentMode)script.contentMode=contentMode;
    if (targetDurationSec&&!explanationLevel)script.targetDurationSec=targetDurationSec;
    if(explanationLevel)script.explanationLevel=explanationLevel;
    if (templatePack) {
      const pack=stylePack(templatePack);script.templatePack=templatePack;script.visualStyle='tech-editorial';
      script.motionPreset=req.body.motionPreset||'dynamic';script.colorTheme=pack.id==='explainer'?'midnight':'teal';
    }
    if (req.body.colorTheme) script.colorTheme = req.body.colorTheme;
    if (req.body.motionPreset) script.motionPreset = req.body.motionPreset;
    if (req.body.soundDesign !== undefined) script.soundDesign = req.body.soundDesign;

    // Apply explicit Studio choices after either LLM or offline generation.
    if (req.body.voice) {
      const selected=ScriptSchema.shape.voice.parse(req.body.voice);
      script.voice={...selected,pronunciationOverrides:mergePronunciationOverrides(script.voice.pronunciationOverrides,selected.pronunciationOverrides)};
    }
    else script.voice={...script.voice,...DEFAULT_VOICE};
    if (req.body.visualStyle) script.visualStyle = req.body.visualStyle;
    if (req.body.captions) script.captions = req.body.captions;
    if (req.body.preset) script.preset = req.body.preset;
    if (req.body.bgm) script.bgm = ScriptSchema.shape.bgm.parse(req.body.bgm);
    if (req.body.useOgImage !== undefined) script.metadata.useOgImage = req.body.useOgImage;
    if (script.voice.uploadId) {
      const upload = await readUpload(script.voice.uploadId);
      assignImportedNarration(script, content || '', upload.durationSec);
    }
    if(templatePack)script.visualStyle="tech-editorial";
    if(req.body.visualStyle==='classic'){delete script.templatePack;delete script.creative;}
    else applyReferenceDefaults(script,creative);
    script.renderSettings=req.body.renderSettings?ScriptSchema.shape.renderSettings.parse(req.body.renderSettings):{fps:24,workers:2,quality:'standard'};
    await hydrateGithubStars(script);
    if(!script.voice.uploadId){
      applySpokenGithubHook(script);
      const hook=script.scenes.find(scene=>scene.type==='hook');
      if(hook)for(const suggestion of script.hookSuggestions||[]){
        const preview={...script,scenes:[{...hook,voiceText:suggestion.voiceText}]};
        applySpokenGithubHook(preview);
        suggestion.voiceText=preview.scenes[0].voiceText;
      }
    }
    res.json(ScriptSchema.parse(script));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── API: Start Pipeline Render ──────────────────────────────────────────────
app.post("/api/render", async (req, res) => {
  try {
    let scriptData = req.body.script;

    // If script not sent directly, generate from input
    if (!scriptData) {
      const { title, content, url, domain, image, channel, voiceId, voiceProvider, preset } = req.body;
      if (!title) return res.status(400).json({ error: "Cần cung cấp title hoặc script" });

      const { provider: llmInstance, info: llmInfo } = await getEffectiveLlmProvider();

      if (llmInstance) {
        try {
          log.info(`[Server] Generating script with configured LLM (${llmInfo.provider} / ${llmInfo.model})...`);
          const llmPreset = preset === "review_60" ? "review_60" : "news_short";
          const llmResult = await generateScript({
            input: url || `${title}\n\n${content}`,
            preset: llmPreset,
            voice:req.body.voice?ScriptSchema.shape.voice.parse(req.body.voice):{...DEFAULT_VOICE},
            measureNarration:(req.body.targetDurationSec||req.body.explanationLevel)&&!req.body.voice?.uploadId?measureNarration:undefined,
            directingMode: ScriptSchema.shape.directingMode.parse(req.body.directingMode),
            explanationLevel: ScriptSchema.shape.explanationLevel.parse(req.body.explanationLevel),
            contentMode: ScriptSchema.shape.contentMode.parse(req.body.contentMode),
            targetDurationSec: ScriptSchema.shape.targetDurationSec.parse(req.body.targetDurationSec),
            source: content ? {title,content,url:url||'manual',domain:domain||'manual',ogImage:image||null} : undefined,
            channelName: channel || "DevPeek36",
            llmProvider: llmInstance,
          });
          scriptData = llmResult.script;
        } catch (llmErr: any) {
          if(req.body.directingMode==='auto')return res.status(502).json({error:'AI chưa dựng được storyboard hợp lệ. Hãy thử lại hoặc đổi model; chưa render nội dung thay thế.'});
          log.warn(`[Server] LLM generation failed (${llmErr.message}), falling back to offline generator...`);
        }
      }

      if (!scriptData) {
        scriptData = await generateScriptFromContent({
          title,
          content: content || title,
          url,
          domain,
          image,
          channel,
          voiceProvider,
          voiceId,
        });
      }
    }

    if (!req.body.script) {
      applyReferenceDefaults(scriptData,CreativeOptions.parse(req.body.creative||{}));
      if(req.body.fitDuration)scriptData.fitDuration=true;
      if (req.body.templatePack) scriptData.templatePack=req.body.templatePack;
      if (req.body.contentMode) scriptData.contentMode=req.body.contentMode;
      if (req.body.targetDurationSec&&!req.body.explanationLevel) scriptData.targetDurationSec=req.body.targetDurationSec;
      if(req.body.explanationLevel)scriptData.explanationLevel=ScriptSchema.shape.explanationLevel.parse(req.body.explanationLevel);
      if (req.body.voice) scriptData.voice = {...req.body.voice,pronunciationOverrides:mergePronunciationOverrides(scriptData.voice?.pronunciationOverrides,req.body.voice.pronunciationOverrides)};
      if (req.body.visualStyle) scriptData.visualStyle = req.body.visualStyle;
      if (req.body.motionPreset) scriptData.motionPreset = req.body.motionPreset;
      if (req.body.soundDesign !== undefined) scriptData.soundDesign = req.body.soundDesign;
      if (req.body.captions) scriptData.captions = req.body.captions;
      if (req.body.preset) scriptData.preset = req.body.preset;
      if (req.body.bgm) scriptData.bgm = req.body.bgm;
      if (req.body.useOgImage !== undefined) scriptData.metadata.useOgImage = req.body.useOgImage;
    }
    // Validate script schema
    const validatedScript = ScriptSchema.parse(scriptData);
    if (validatedScript.voice.uploadId) {
      const upload = await readUpload(validatedScript.voice.uploadId);
      importedBoundaries(validatedScript, upload.durationSec);
      importedCues(validatedScript, upload.durationSec);
    } else { voiceConfig(validatedScript.voice); }

    // Create unique slug & output directory
    const slug = toSlug(validatedScript.metadata.title);
    const timestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14) + "-" + randomUUID().slice(0, 8);
    const outputDir = join(OUTPUT_DIR, `${slug}-${timestamp}`);
    await mkdir(outputDir, { recursive: true });

    // Save script.json
    const scriptPath = join(outputDir, "script.json");
    await writeFile(scriptPath, JSON.stringify(validatedScript, null, 2), "utf8");

    // Initialize job
    const jobId = `${slug}-${timestamp}`;
    const job: Job = {
      id: jobId,
      slug: `${slug}-${timestamp}`,
      outputDir,
      status: "running",
      step: 1,
      totalSteps: 8,
      stepMessage: "Khởi động quy trình...",
      logs: [`[${new Date().toLocaleTimeString()}] Bắt đầu render video: ${validatedScript.metadata.title}`],
      clients: [],
    };
    jobs.set(jobId, job);

    // Run pipeline asynchronously
    (async () => {
      try {
        await runPipeline(scriptPath);

        // Generate caption.txt for TikTok
        const captionText = defaultCaption(validatedScript.metadata.title);
        await writeFile(join(outputDir, "caption.txt"), captionText, "utf8");

        job.status = "completed";
        job.videoUrl = `/api/videos/${job.slug}/file/video.mp4`;
        job.caption = captionText;

        broadcastToJob(job, "completed", {
          slug: job.slug,
          videoUrl: job.videoUrl,
          caption: captionText,
        });
      } catch (err: any) {
        job.status = "failed";
        job.error = err.message || String(err);
        broadcastToJob(job, "failed", { error: job.error });
      }
    })();

    res.json({
      jobId,
      slug: job.slug,
      outputDir,
      message: "Pipeline đã được khởi chạy thành công",
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── API: SSE Progress Stream ────────────────────────────────────────────────
app.get("/api/progress/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).send("Job not found");

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  job.clients.push(res);

  // Send current state immediately
  res.write(
    `event: initial\ndata: ${JSON.stringify({
      step: job.step,
      totalSteps: job.totalSteps,
      status: job.status,
      slug: job.slug,
      error: job.error,
      logs: job.logs,
      videoUrl: job.videoUrl,
      caption: job.caption,
    })}\n\n`
  );

  req.on("close", () => {
    job.clients = job.clients.filter((c) => c !== res);
  });
});

// ── API: List Videos ────────────────────────────────────────────────────────
app.get("/api/videos", async (req, res) => {
  try {
    if (!existsSync(OUTPUT_DIR)) {
      return res.json([]);
    }

    const entries = await readdir(OUTPUT_DIR, { withFileTypes: true });
    const videoList = [];

    for (const ent of entries) {
      if (ent.isDirectory()) {
        const folder = join(OUTPUT_DIR, ent.name);
        const scriptFile = join(folder, "script.json");
        const videoFile = join(folder, "video.mp4");
        const captionFile = join(folder, "caption.txt");
        const voiceFile = join(folder, "voice.mp3");

        let title = ent.name;
        let scriptData = null;
        let caption = null;

        if (existsSync(scriptFile)) {
          try {
            scriptData = JSON.parse(await readFile(scriptFile, "utf8"));
            title = scriptData.metadata?.title || title;
          } catch {}
        }

        if (existsSync(captionFile)) {
          try {
            caption = await readFile(captionFile, "utf8");
          } catch {}
        }

        const hasVideo = existsSync(videoFile);
        let videoSize = 0;
        let mtime = new Date(0);

        if (hasVideo) {
          const stats = await stat(videoFile);
          videoSize = stats.size;
          mtime = stats.mtime;
        } else if (existsSync(scriptFile)) {
          const stats = await stat(scriptFile);
          mtime = stats.mtime;
        }

        videoList.push({
          slug: ent.name,
          title,
          hasVideo,
          hasAudio: existsSync(voiceFile),
          videoSizeMb: (videoSize / (1024 * 1024)).toFixed(1),
          videoUrl: hasVideo ? `/api/videos/${ent.name}/file/video.mp4` : null,
          audioUrl: existsSync(voiceFile) ? `/api/videos/${ent.name}/file/voice.mp3` : null,
          thumbnailUrl: hasVideo ? `/api/videos/${encodeURIComponent(ent.name)}/thumbnail?v=${mtime.getTime()}` : null,
          caption,
          mtime,
          sceneCount: scriptData?.scenes?.length || 0,
        });
      }
    }

    // Sort newest first
    videoList.sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());

    res.json(videoList);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Bundled font used by HTML composition previews.
app.get('/api/videos/:slug/file/fonts/:filename', (req, res) => {
  if (!/^[a-zA-Z0-9_-]+$/.test(String(req.params.slug)) || req.params.filename !== 'BeVietnamPro-Bold.ttf') return res.sendStatus(404);
  res.sendFile(join(OUTPUT_DIR, String(req.params.slug), 'fonts', 'BeVietnamPro-Bold.ttf'));
});

// Self-contained assets used by project preview/timeline.
app.get('/api/videos/:slug/file/media/:filename', (req,res)=>{
  const {slug,filename}=req.params;
  if(!/^[a-zA-Z0-9_-]+$/.test(String(slug)) || !/^[a-zA-Z0-9_.-]+$/.test(String(filename)) || String(filename).includes('..'))return res.sendStatus(404);
  res.sendFile(join(OUTPUT_DIR,String(slug),'media',String(filename)));
});

// Shared by library posters and downloadable full-size PNG covers.
app.get('/api/videos/:slug/thumbnail',async(req,res)=>{
  const slug=String(req.params.slug);
  if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,180}$/.test(slug))return res.status(400).json({error:'Tên video không hợp lệ.'});
  const folder=join(OUTPUT_DIR,slug),video=join(folder,'video.mp4');
  if(!existsSync(video))return res.status(404).json({error:'Video chưa render xong.'});
  try{
    const cover=await ensureVideoThumbnail(video,join(folder,'cover.png'));
    res.set('Cache-Control','no-cache');
    if(req.query.download==='1')return res.download(cover,`${slug}-cover.png`);
    res.type('png').sendFile(cover);
  }catch{res.status(500).json({error:'Chưa tạo được thumbnail. Hãy thử tải lại video.'});}
});

// ── API: File Streaming with Range support ───────────────────────────────────
app.get("/api/videos/:slug/file/:filename", async (req, res) => {
  const { slug, filename } = req.params;
  const filePath = join(OUTPUT_DIR, slug, filename);

  if (!existsSync(filePath)) {
    return res.status(404).send("File not found");
  }

  const statData = await stat(filePath);
  const fileSize = statData.size;
  const range = req.headers.range;
  const isDownload = req.query.download === "true" || req.query.download === "1";

  const contentType =
    filename.endsWith(".mp4") ? "video/mp4"
    : filename.endsWith(".mp3") ? "audio/mpeg"
    : filename.endsWith(".txt") ? "text/plain; charset=utf-8"
    : filename.endsWith(".json") ? "application/json"
    : filename.endsWith(".html") ? "text/html; charset=utf-8"
    : filename.endsWith(".css") ? "text/css; charset=utf-8"
    : filename.endsWith(".js") ? "application/javascript; charset=utf-8"
    : filename.endsWith(".png") ? "image/png"
    : filename.endsWith(".jpg") || filename.endsWith(".jpeg") ? "image/jpeg"
    : filename.endsWith(".webp") ? "image/webp"
    : filename.endsWith(".svg") ? "image/svg+xml"
    : "application/octet-stream";

  const headers: Record<string, string | number> = {
    "Content-Type": contentType,
  };

  if (isDownload) {
    headers["Content-Disposition"] = `attachment; filename="${encodeURIComponent(filename)}"`;
  }

  if (range && filename.endsWith(".mp4") && !isDownload) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const fileStream = createReadStream(filePath, { start, end });

    res.writeHead(206, {
      ...headers,
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunksize,
    });
    fileStream.pipe(res);
  } else {
    res.writeHead(200, {
      ...headers,
      "Content-Length": fileSize,
    });
    createReadStream(filePath).pipe(res);
  }
});

// ── API: Direct Video Download ──────────────────────────────────────────────
app.get("/api/videos/:slug/download", async (req, res) => {
  const { slug } = req.params;
  const filePath = join(OUTPUT_DIR, slug, "video.mp4");
  if (!existsSync(filePath)) {
    return res.status(404).json({ error: "Không tìm thấy file video.mp4" });
  }
  res.download(filePath, `${slug}.mp4`);
});

// ── API: Delete video folder ────────────────────────────────────────────────
app.delete("/api/videos/:slug", async (req, res) => {
  const { slug } = req.params;
  const targetDir = join(OUTPUT_DIR, slug);
  if (!existsSync(targetDir)) return res.status(404).json({ error: "Thư mục không tồn tại" });

  try {
    await rm(targetDir, { recursive: true, force: true });
    res.json({ success: true, message: "Đã xoá video thành công" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: Cancel Job (M6) ───────────────────────────────────────────────────
app.post("/api/jobs/:jobId/cancel", (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);
  if (!job) return res.status(404).json({ error: "Không tìm thấy job" });

  if (job.status === "running") {
    job.status = "failed";
    job.error = "Đã huỷ bởi người dùng";
    broadcastToJob(job, "failed", { error: job.error });
  }
  res.json({ success: true, message: "Đã gửi tín hiệu huỷ tiến trình render" });
});

// ── API: List Projects (M6) ────────────────────────────────────────────────
app.get("/api/projects", async (req, res) => {
  try {
    if (!existsSync(OUTPUT_DIR)) return res.json([]);
    const entries = await readdir(OUTPUT_DIR, { withFileTypes: true });
    const projects = [];

    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const folder = join(OUTPUT_DIR, ent.name);
      const scriptFile = join(folder, "script.json");
      if (!existsSync(scriptFile)) continue;

      let title = ent.name;
      let schemaVersion = 1;
      let sceneCount = 0;
      let mtime = new Date(0);

      try {
        const raw = JSON.parse(await readFile(scriptFile, "utf8"));
        title = raw.metadata?.title || title;
        schemaVersion = raw.schemaVersion || 1;
        sceneCount = raw.scenes?.length || 0;
      } catch {}

      try {
        const st = await stat(scriptFile);
        mtime = st.mtime;
      } catch {}

      projects.push({
        slug: ent.name,
        title,
        schemaVersion,
        sceneCount,
        hasVideo: existsSync(join(folder, "video.mp4")),
        hasAudio: existsSync(join(folder, "voice.mp3")),
        hasCaptions: existsSync(join(folder, "captions.json")),
        mtime,
      });
    }

    projects.sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());
    res.json(projects);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: Get Project Detail & Timeline State (M6) ───────────────────────────
app.get("/api/projects/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const folder = join(OUTPUT_DIR, slug);
    const scriptFile = join(folder, "script.json");

    if (!existsSync(scriptFile)) {
      return res.status(404).json({ error: "Không tìm thấy script.json trong project" });
    }

    const raw = JSON.parse(await readFile(scriptFile, "utf8"));
    const script = ScriptSchema.parse(raw);

    // Thu thập thời lượng thật của các scene audio nếu có
    const audioDurations: Record<string, number> = {};
    const voiceDir = join(folder, "voice");
    if (existsSync(voiceDir)) {
      for (const scene of script.scenes) {
        const sceneAudioPath = join(voiceDir, `scene-${scene.id}.mp3`);
        if (existsSync(sceneAudioPath)) {
          try {
            audioDurations[scene.id] = await getDurationSec(sceneAudioPath);
          } catch {}
        }
      }
    }

    // Đọc captions nếu có
    let captionCues = undefined;
    const captionsFile = join(folder, "captions.json");
    if (existsSync(captionsFile)) {
      try {
        captionCues = JSON.parse(await readFile(captionsFile, "utf8")).map((c: any) => ({
          start: c.start ?? c.startSec ?? c.startMs / 1000,
          end: c.end ?? c.endSec ?? c.endMs / 1000,
          text: c.text,
        })).filter((c: any) => Number.isFinite(c.start) && Number.isFinite(c.end) && c.end > c.start);
      } catch {}
    }

    // Đọc media.json nếu có
    let media = null;
    const mediaFile = join(folder, "media.json");
    if (existsSync(mediaFile)) {
      try {
        media = JSON.parse(await readFile(mediaFile, "utf8"));
      } catch {}
    }

    // Đọc sources.json nếu có
    let sources = null;
    const sourcesFile = join(folder, "sources.json");
    if (existsSync(sourcesFile)) {
      try {
        sources = JSON.parse(await readFile(sourcesFile, "utf8"));
      } catch {}
    }

    // Nâng cấp và dựng Timeline State
    const scriptV2 = migrateV1toV2(script, audioDurations);
    const timelineState = buildTimelineState(scriptV2, audioDurations, captionCues);

    res.json({
      slug,
      script: scriptV2,
      timelineState,
      sources,
      media,
      hasVideo: existsSync(join(folder, "video.mp4")),
      hasAudio: existsSync(join(folder, "voice.mp3")),
      videoUrl: existsSync(join(folder, "video.mp4")) ? `/api/videos/${slug}/file/video.mp4` : null,
      audioUrl: existsSync(join(folder, "voice.mp3")) ? `/api/videos/${slug}/file/voice.mp3` : null,
      previewUrl: existsSync(join(folder, "index.html")) ? `/api/videos/${slug}/file/index.html` : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: Save Project Script (M6) ──────────────────────────────────────────
app.post("/api/projects/:slug/script", async (req, res) => {
  try {
    const { slug } = req.params;
    const folder = join(OUTPUT_DIR, slug);
    const scriptFile = join(folder, "script.json");

    if (!existsSync(folder)) {
      return res.status(404).json({ error: "Project folder not found" });
    }

    const validated = ScriptSchema.parse(req.body.script);
    await writeFile(scriptFile, JSON.stringify(validated, null, 2), "utf8");

    res.json({ success: true, script: validated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── API: Re-TTS for a single Scene (M6) ────────────────────────────────────
app.post("/api/projects/:slug/re-tts/:sceneId", async (req, res) => {
  try {
    const { slug, sceneId } = req.params;
    const folder = join(OUTPUT_DIR, slug);
    const scriptFile = join(folder, "script.json");

    if (!existsSync(scriptFile)) {
      return res.status(404).json({ error: "Không tìm thấy project" });
    }

    const raw = JSON.parse(await readFile(scriptFile, "utf8"));
    const script = ScriptSchema.parse(raw);
    const scene = script.scenes.find((s) => s.id === sceneId);
    if (!scene) {
      return res.status(404).json({ error: `Không tìm thấy scene có id '${sceneId}'` });
    }

    if (script.voice.uploadId) return res.status(400).json({ error: "Dự án dùng voice tải lên. Sửa file audio/SRT và tạo bản mới; Re-TTS không áp dụng." });
    const cfg = voiceConfig(script.voice);
    const voiceDir = join(folder, "voice");
    await mkdir(voiceDir, { recursive: true });

    const sceneAudioPath = join(voiceDir, `scene-${sceneId}.mp3`);
    if (existsSync(sceneAudioPath)) {
      await rm(sceneAudioPath, { force: true });
    }

    // 1. Áp dụng Lexicon nếu có
    // Pronunciation preference is applied consistently inside cachedSpeech.

    // 2. Gọi TTS Client
    const ttsClient = studioTts(cfg, script.voice);
    await cachedSpeech(scene.voiceText, sceneAudioPath, cfg, script.voice.speed, ttsClient, script.voice.pronunciation, script.voice.pronunciationOverrides);

    // 3. Tính duration mới của scene
    const newDuration = await getDurationSec(sceneAudioPath);

    // 4. Ghép lại toàn bộ voice scenes thành voice.mp3 nếu các file khác đều có
    const audioFiles: string[] = [];
    for (const sc of script.scenes) {
      const p = join(voiceDir, `scene-${sc.id}.mp3`);
      if (existsSync(p)) {
        audioFiles.push(p);
      }
    }

    if (audioFiles.length === script.scenes.length) {
      const voiceMp3 = join(folder, "voice.mp3");
      await concatWithSilence(audioFiles, 0.3, voiceMp3);
    }

    // Audio changed: invalidate global captions and rendered preview until full render.
    for (const file of ['captions.json', 'captions.srt', 'video.mp4', 'index.html']) await rm(join(folder, file), { force: true });
    // 5. Cập nhật duration vào script.timeline
    if (!script.timeline) {
      script.timeline = { scenes: {}, captionCues: [] };
    }
    if (!script.timeline.scenes) {
      script.timeline.scenes = {};
    }
    if (!script.timeline.scenes[sceneId]) {
      script.timeline.scenes[sceneId] = {};
    }
    script.timeline.scenes[sceneId].duration = Math.round(newDuration * 1000) / 1000;
    script.schemaVersion = 2;

    await writeFile(scriptFile, JSON.stringify(script, null, 2), "utf8");

    res.json({
      success: true,
      sceneId,
      newDuration: Math.round(newDuration * 1000) / 1000,
      audioUrl: `/api/videos/${slug}/file/voice.mp3`,
    });
  } catch (err: any) {
    res.status(500).json({ error: `Re-TTS thất bại: ${err.message}` });
  }
});

// ── API: RSS Feeds (M7) ────────────────────────────────────────────────────
app.get("/api/feeds", async (req, res) => {
  try {
    const sources = loadFeedsConfig();
    const items = await fetchFeedItems(sources);
    res.json({ sources, items });
  } catch (err: any) {
    res.status(500).json({ error: `Lỗi quét feeds: ${err.message}` });
  }
});

// ── API: Batch Generate from Feeds (M7) ────────────────────────────────────
app.post("/api/feeds/batch", async (req, res) => {
  try {
    const { items, maxJobs } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Danh sách items không hợp lệ" });
    }

    const queue = new BatchQueue();
    // Chạy bất đồng bộ
    const resultPromise = queue.process(items, { maxJobs: maxJobs || 3 });
    res.json({ success: true, message: `Đã đưa ${items.length} bài vào hàng đợi batch` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: Lexicon Dictionary (M5) ───────────────────────────────────────────
const LEXICON_FILE = join(PROJECT_ROOT, "config", "lexicon.json");

app.get("/api/lexicon", async (req, res) => {
  try {
    if (!existsSync(LEXICON_FILE)) {
      return res.json({});
    }
    const data = JSON.parse(await readFile(LEXICON_FILE, "utf-8"));
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/lexicon", async (req, res) => {
  try {
    const { lexicon } = req.body;
    if (!lexicon || typeof lexicon !== "object") {
      return res.status(400).json({ error: "Dữ liệu lexicon không hợp lệ" });
    }
    validateLexicon(lexicon);
    await writeFile(LEXICON_FILE, JSON.stringify(lexicon, null, 2), "utf-8");
    resetLexiconCache();
    res.json({ success: true, lexicon });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: Project Publish Kit Info (M7) ─────────────────────────────────────
app.get("/api/projects/:slug/publish", async (req, res) => {
  try {
    const { slug } = req.params;
    const folder = join(OUTPUT_DIR, slug);
    const publishFile = join(folder, "publish.md");
    const coverFile = join(folder, "cover.png");
    const scriptFile = join(folder, "script.json");

    let publishContent = "";
    if (existsSync(publishFile)) {
      publishContent = await readFile(publishFile, "utf-8");
    } else if (existsSync(scriptFile)) {
      const script = JSON.parse(await readFile(scriptFile, "utf-8"));
      publishContent = generatePublishChecklist(
        {
          suggestedTitle: script.metadata?.title,
          channelName: script.metadata?.channel,
          sourceUrl: script.metadata?.source?.url,
        },
        script
      );
    }

    res.json({
      slug,
      publishContent,
      hasCover: existsSync(coverFile),
      coverUrl: existsSync(coverFile) ? `/api/videos/${slug}/file/cover.png` : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: Captions Import (M1) ──────────────────────────────────────────────
app.post("/api/projects/:slug/captions", async (req, res) => {
  try {
    const { slug } = req.params;
    const { srtContent } = req.body;
    if (!srtContent) return res.status(400).json({ error: "Cần srtContent" });

    const folder = join(OUTPUT_DIR, slug);
    if (!existsSync(folder)) return res.status(404).json({ error: "Project not found" });

    const cues = parseSrt(srtContent);
    await writeFile(join(folder, "captions.srt"), srtContent, "utf-8");
    await writeFile(join(folder, "captions.json"), JSON.stringify(cues, null, 2), "utf-8");

    // Đồng bộ vào script.json nếu có
    const scriptFile = join(folder, "script.json");
    if (existsSync(scriptFile)) {
      const script = JSON.parse(await readFile(scriptFile, "utf-8"));
      if (!script.timeline) script.timeline = {};
      script.timeline.captionCues = cues.map((c: any) => ({
        start: c.startMs / 1000,
        end: c.endMs / 1000,
        text: c.text,
      }));
      await writeFile(scriptFile, JSON.stringify(script, null, 2), "utf-8");
    }

    res.json({ success: true, count: cues.length });
  } catch (err: any) {
    res.status(400).json({ error: `Lỗi import SRT: ${err.message}` });
  }
});

// Start Server
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🎬 Auto Video Gen Web Dashboard is running!`);
    console.log(`👉 Open: http://localhost:${PORT}`);
    console.log(`======================================================\n`);
  });
}
