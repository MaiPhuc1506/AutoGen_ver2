import { fetchSourceContent } from "../script/source-fetcher.js";
import { collectGithubVisuals, type VisualAsset } from "./visuals.js";
import { captureUrlScreenshot } from "../media/screenshot.js";
import { readUpload, uploadPath } from "./uploads.js";
import { planCreativeVisuals } from "./creative-planner.js";
import { alignCreativeAudioAndSubtitles, validateTimelineSanity } from "../captions/audio-aligner.js";
import { generateSrt } from "../captions/srt.js";
import { ScriptSchema, type Script } from "../render/script-schema.js";
import type { LLMProvider } from "../script/types.js";
import { DEFAULT_BGM } from "../channel-defaults.js";
import { log } from "../utils/logger.js";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { UPLOAD_DIR } from "./uploads.js";

export interface BuildCreativeScriptParams {
  url: string;
  transcript: string;
  audioUploadId: string;
  srtContent?: string;
  templatePack?: string;
  channelName?: string;
  llmProvider?: LLMProvider | null;
}

export interface BuildCreativeScriptResult {
  script: Script;
  alignment: Awaited<ReturnType<typeof alignCreativeAudioAndSubtitles>>;
  sourceTitle: string;
}

/**
 * Builds a validated, self-contained Script object for Creative Mode.
 */
export async function buildCreativeScript(
  params: BuildCreativeScriptParams
): Promise<BuildCreativeScriptResult> {
  const {
    url,
    transcript,
    audioUploadId,
    srtContent,
    templatePack = "reference",
    channelName = "DevPeek36",
    llmProvider,
  } = params;

  // 1. Read uploaded audio metadata
  const audioInfo = await readUpload(audioUploadId);
  const audioDurationSec = audioInfo.durationSec;
  log.info(`[Creative Builder] Uploaded audio duration: ${audioDurationSec.toFixed(2)}s`);

  // 2. Extract context and real visual assets from URL
  let source;
  try {
    source = await fetchSourceContent(url);
  } catch (err: any) {
    log.warn(`[Creative Builder] Could not fetch URL content: ${err.message}. Using fallback metadata.`);
    source = {
      title: "Công nghệ nổi bật",
      content: transcript,
      url: url || "https://github.com",
      domain: url ? new URL(url).hostname : "github.com",
      ogImage: null,
    };
  }

  // Collect real assets (screenshot / logo / avatar)
  const availableAssets: VisualAsset[] = [];
  if (url.includes("github.com")) {
    try {
      const gVisuals = await collectGithubVisuals(url);
      availableAssets.push(...gVisuals.assets);
    } catch (gErr: any) {
      log.warn(`[Creative Builder] GitHub visual capture failed: ${gErr.message}`);
    }
  } else if (url.startsWith("http")) {
    try {
      const id = randomUUID();
      const tmpPath = join(UPLOAD_DIR, `${id}.screenshot.jpg`);
      const shot = await captureUrlScreenshot(url, tmpPath, { width: 1440, height: 1100 });
      if (shot.success) {
        availableAssets.push({
          id,
          label: "Screenshot bài viết",
          kind: "screenshot",
          source: url,
          previewUrl: tmpPath,
        });
      }
    } catch (shotErr: any) {
      log.warn(`[Creative Builder] URL screenshot failed: ${shotErr.message}`);
    }
  }

  // 3. Plan scenes using AI Visual Planner (with safe fallback)
  const plannedScenes = await planCreativeVisuals({
    transcript,
    url,
    source,
    availableAssets,
    llmProvider,
    channelName,
  });

  // 4. Align Audio and Subtitles
  const sceneTexts = plannedScenes.map((s) => s.voiceText);
  const alignment = await alignCreativeAudioAndSubtitles({
    audioPath: audioInfo.path,
    totalDurationSec: audioDurationSec,
    transcript,
    sceneTexts,
    srtContent,
  });

  // Verify timeline sanity
  const sanity = validateTimelineSanity({
    sceneBoundaries: alignment.sceneBoundaries,
    totalDurationSec: audioDurationSec,
    sceneCount: plannedScenes.length,
    isOutroLast: true,
  });
  if (!sanity.valid) {
    log.warn(`[Creative Builder] Timeline sanity warning: ${sanity.errors.join("; ")}`);
  }

  // Generate captions SRT string
  const finalSrt = srtContent && srtContent.trim() ? srtContent.trim() : generateSrt(alignment.cues);

  // 5. Assemble complete Script
  const rawScript: any = {
    schemaVersion: 2,
    version: "2.0",
    directingMode: "auto",
    templatePack: templatePack || "reference",
    visualStyle: "tech-editorial",
    motionPreset: "calm",
    soundDesign: true,
    fitDuration: false, // Never alter tempo of uploaded ElevenLabs audio
    explanationLevel: audioDurationSec <= 60 ? "quick" : audioDurationSec <= 90 ? "standard" : "detailed",
    targetDurationSec: Math.max(1, Math.round(audioDurationSec)),
    metadata: {
      title: source.title,
      source: {
        url: source.url,
        domain: source.domain || "github.com",
        image: source.ogImage || null,
      },
      channel: channelName,
      useOgImage: false,
    },
    voice: {
      provider: "imported",
      voiceId: "elevenlabs-voice",
      speed: 1.0,
      settingsSource: "script",
      uploadId: audioUploadId,
      captionsSrt: finalSrt,
      sceneBoundaries: alignment.sceneBoundaries,
    },
    captions: {
      enabled: true,
      style: "tiktok-bold",
      highlightMode: alignment.highlightMode,
    },
    bgm: {
      ...DEFAULT_BGM,
      enabled: true,
      duck: true,
    },
    scenes: plannedScenes,
  };

  // Find logo if available
  const logo = availableAssets.find((a) => a.kind === "repo-logo" || a.kind === "owner-avatar");
  if (logo) {
    rawScript.metadata.logoAssetId = logo.id;
  }

  // Validate via ScriptSchema
  const validated = ScriptSchema.parse(rawScript);

  return {
    script: validated,
    alignment,
    sourceTitle: source.title,
  };
}
