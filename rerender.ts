import {referenceSettings} from './src/render/reference-design.js';
import {stripCssImports} from './src/render/css.js';
import {createRequire} from 'node:module';
// One-off script: re-render the existing composition without re-running TTS.
// Uses already-generated per-scene voice files in <outputDir>/voice/.
//
// Usage: npx tsx rerender.ts <outputDir>

import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig();

import { readFile, writeFile, copyFile, mkdir } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { ScriptSchema } from "./src/render/script-schema.js";
import { loadConfig } from "./src/config.js";
import { getDurationSec, concatWithSilence, mixSfxOntoVoice, mixBgmWithVoice, type SfxMixSpec } from "./src/assets/audio-tools.js";
import {DEFAULT_BGM} from './src/channel-defaults.js';
import {ensureVideoThumbnail} from './src/ingest/thumbnail.js';
import { indexSfxLibrary, pickSfxForScene, defaultPlayback } from "./src/assets/sfx-selector.js";
import { existsSync } from "node:fs";
import { composeHtml } from "./src/render/html-composer.js";
import { renderWithHyperframes } from "./src/render/hyperframes-runner.js";
import { parseSrt } from "./src/captions/srt.js";
import type { CaptionCue } from "./src/captions/types.js";
import type { MediaAssetRecord } from "./src/media/media-manager.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TPL_DIR = join(__dirname, "src", "render", "templates");
const SFX_DIR = join(__dirname, "assets", "sfx");
const SCENE_GAP_SEC = 0.3;

const HYPERFRAMES_CONFIG = {
  $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
  registry: "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
  paths: { blocks: "compositions", components: "compositions/components", assets: "assets" },
};

async function main() {
  const outputDir = process.argv[2];
  if (!outputDir) {
    console.error("Usage: npx tsx rerender.ts <outputDir>");
    process.exit(2);
  }

  const cfg = loadConfig();
  console.log(`Re-rendering: ${outputDir}`);

  // Load script.json
  const raw = JSON.parse(await readFile(join(outputDir, "script.json"), "utf8"));
  if (raw.voice?.voiceId === "${VIETNAMESE_VOICEID}" || raw.voice?.voiceId === "${VOICE_ID}") {
    raw.voice.voiceId =
      cfg.ttsProvider === "edge-tts" ? cfg.edgeTtsVoice
      : cfg.ttsProvider === "lucylab" ? cfg.lucylabVoiceId!
      : cfg.ttsProvider === "elevenlabs" ? cfg.elevenlabsVoiceId!
      : cfg.vbeeVoiceCode;
  }
  const script = ScriptSchema.parse(raw);
  const fpsArg=process.argv.find(a=>a.startsWith('--fps='));
  const fps=fpsArg?Number(fpsArg.slice(6)):(script.renderSettings?.fps??30);
  if(![24,30,60].includes(fps))throw new Error('--fps chỉ hỗ trợ 24, 30 hoặc 60 theo HyperFrames.');
  const reference=referenceSettings(script);
  if(reference||script.templatePack)script.visualStyle='tech-editorial';
  const gapSec=script.voice.uploadId?0:reference?.gapSec??(script.visualStyle==='tech-editorial'?.08:SCENE_GAP_SEC);
  const outroHoldSec=reference?.outroHoldSec??(script.visualStyle==='tech-editorial'?.6:3);

  // Probe per-scene durations from existing voice files
  const sceneAudio = await Promise.all(
    script.scenes.map(async (s) => {
      const path = join(outputDir, "voice", `scene-${s.id}.mp3`);
      const dur = await getDurationSec(path);
      console.log(`  scene ${s.id}: ${dur.toFixed(2)}s`);
      return { id: s.id, path, durationSec: dur };
    })
  );

  // Re-concat voice (in case audio-tools fix changed encoding)
  const voiceRawMp3 = join(outputDir, "voice-raw.mp3");
  const voiceMp3 = join(outputDir, "voice.mp3");
  await concatWithSilence(sceneAudio.map((a) => a.path), gapSec, voiceRawMp3);

  // Compute scene start times + collect SFX
  let cursor = 0;
  const sceneStarts: Record<string, number> = {};
  for (const a of sceneAudio) {
    sceneStarts[a.id] = cursor;
    cursor += a.durationSec + gapSec;
  }
  // Smart SFX selection — same 3-tier logic as pipeline
  const sfxIndex = indexSfxLibrary(SFX_DIR);
  const sfxList: SfxMixSpec[] = [];
  for (const scene of script.scenes) {
    const startSec = sceneStarts[scene.id];
    if (scene.sfx) {
      if (scene.sfx.name === "none") continue;
      const sfxPath = join(SFX_DIR, `${scene.sfx.name}.mp3`);
      if (existsSync(sfxPath)) {
        sfxList.push({ path: sfxPath, startSec: startSec + scene.sfx.startOffsetSec, volume: scene.sfx.volume });
        console.log(`  scene ${scene.id}: SFX override -> ${scene.sfx.name}`);
      }
      continue;
    }
    const picked = pickSfxForScene({
      voiceText: scene.voiceText,
      templateName: scene.templateData.template,
      sceneId: scene.id,
      index: sfxIndex,
    });
    if (!picked) continue;
    const sfxPath = join(SFX_DIR, picked.relPath);
    const playback = defaultPlayback(picked);
    sfxList.push({ path: sfxPath, startSec: startSec + playback.offsetSec, volume: playback.volume });
    const why = picked.source === "semantic" ? `semantic "${picked.matchedKeyword}"` : picked.source;
    console.log(`  scene ${scene.id}: SFX -> ${picked.relPath} (${why})`);
  }
  console.log(`mixing ${sfxList.length} SFX into voice.mp3`);
  await mixSfxOntoVoice(voiceRawMp3, sfxList, voiceMp3);

  const bgm=script.bgm ?? DEFAULT_BGM;
  if(bgm.enabled!==false && existsSync(bgm.src)){
    const dry=join(outputDir,'voice-before-bgm.mp3');await copyFile(voiceMp3,dry);
    await mixBgmWithVoice(dry,bgm.src,voiceMp3,{...bgm,durationSec:sceneAudio.reduce((n,a)=>n+a.durationSec+gapSec,0)+outroHoldSec});
  }

  const totalDur = await getDurationSec(voiceMp3);
  console.log(`voice.mp3 total: ${totalDur.toFixed(2)}s`);

  // Determine bg image
  const bgImagePath = join(outputDir, "images", "bg.jpg");
  const fs = await import("node:fs");
  const bgImageRelPath = fs.existsSync(bgImagePath) ? "images/bg.jpg" : null;
  console.log(`bgImage: ${bgImageRelPath ?? "(none — gradient fallback)"}`);

  // TikTok avatar — find bundled (jpg/jpeg/png/webp) and copy to output dir
  let bundledAvatar: string | null = null;
  for (const ext of ["jpg", "jpeg", "png", "webp"]) {
    const p = join(__dirname, "assets", `avatar.${ext}`);
    if (existsSync(p)) { bundledAvatar = p; break; }
  }
  if (!bundledAvatar) {
    throw new Error("No bundled avatar found. Place an image at assets/avatar.{jpg,png,webp}");
  }
  const ttAvatarExt = bundledAvatar.split(".").pop()!.toLowerCase();
  const ttAvatarFile = `tiktok-avatar.${ttAvatarExt}`;
  const ttAvatarOut = join(outputDir, ttAvatarFile);
  // Always re-copy in case bundled was updated
  await copyFile(bundledAvatar, ttAvatarOut);

  // Load optional captions (M1)
  let captionCues: CaptionCue[] | undefined;
  const captionsJsonPath = join(outputDir, "captions.json");
  const captionsSrtPath = join(outputDir, "captions.srt");
  if (existsSync(captionsJsonPath)) {
    try {
      captionCues = JSON.parse(await readFile(captionsJsonPath, "utf8"));
    } catch {}
  } else if (existsSync(captionsSrtPath)) {
    try {
      captionCues = parseSrt(await readFile(captionsSrtPath, "utf8"));
    } catch {}
  }

  // Load optional media manifest (M2)
  let mediaMap: Record<string, MediaAssetRecord> | undefined;
  const mediaJsonPath = join(outputDir, "media.json");
  if (existsSync(mediaJsonPath)) {
    try {
      const records: MediaAssetRecord[] = JSON.parse(await readFile(mediaJsonPath, "utf8"));
      mediaMap = {};
      for (const r of records) mediaMap[r.sceneId] = r;
    } catch {}
  }

  // Compose HTML
  const html = composeHtml({
    script,
    sceneAudio: sceneAudio.map((a) => ({ id: a.id, durationSec: a.durationSec })),
    gapSec,
    bgImageRelPath,
    audioRelPath: "voice.mp3",
    tiktok: cfg.tiktok,
    tiktokAvatarRelPath: ttAvatarFile,
    outroHoldSec,
    captionCues,
    mediaMap,
  });
  await writeFile(join(outputDir, "index.html"), html);
  await writeFile(join(outputDir, "hyperframes.json"), JSON.stringify(HYPERFRAMES_CONFIG, null, 2));
  await writeFile(join(outputDir, "meta.json"), JSON.stringify({
    id: basename(outputDir),
    name: script.metadata.title,
    createdAt: new Date().toISOString(),
  }, null, 2));
  await copyFile(join(TPL_DIR, "styles.css"),    join(outputDir, "styles.css"));
  if(script.visualStyle==='tech-editorial'){
    const base=stripCssImports(await readFile(join(TPL_DIR,'styles.css'),'utf8'));
    await writeFile(join(outputDir,'styles.css'),base+'\n'+await readFile(join(TPL_DIR,'styles.tech-editorial.css'),'utf8')+'\n'+await readFile(join(TPL_DIR,'styles.follow-card.css'),'utf8'));
    await mkdir(join(outputDir,'fonts'),{recursive:true});
    await copyFile(join(__dirname,'assets/fonts/BeVietnamPro-Bold.ttf'),join(outputDir,'fonts/BeVietnamPro-Bold.ttf'));
    await copyFile(createRequire(import.meta.url).resolve('gsap/dist/gsap.min.js'),join(outputDir,'gsap.min.js'));
  }
  await copyFile(join(TPL_DIR, "animations.js"), join(outputDir, "animations.js"));

  // Render
  const videoPath = join(outputDir, "video.mp4");
  await renderWithHyperframes({ compositionDir: outputDir, outputPath: videoPath, fps, workers:process.argv.includes('--workers=4')?4:process.argv.includes('--workers=1')?1:script.renderSettings?.workers??2, quality:process.argv.includes('--draft')?'draft':script.renderSettings?.quality??'standard' });
  await ensureVideoThumbnail(videoPath,join(outputDir,'cover.png'));
  console.log(`\nDone: ${videoPath}`);
}

main().catch((e) => { console.error("Re-render failed:", e); process.exit(1); });
