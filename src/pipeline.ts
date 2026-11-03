import {measureWithShortHook} from './script/measured-hook.js';
import {measureNarration,assessNarration} from './studio/narration-timing.js';
import {ensureRepositoryHero} from './studio/repository-hero.js';
import {cleanScriptNarration,validateNarrationRepetition} from './script/narration-cleanup.js';
import {hydrateGithubStars,applySpokenGithubHook} from './script/github-stars.js';
import {referenceSettings} from './render/reference-design.js';
import {preparedPronunciationReport} from "./tts/smart-pronunciation.js";
import {stripCssImports} from "./render/css.js";
import {fitVoiceDuration} from "./studio/duration.js";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import pLimit from "p-limit";
import { ScriptSchema, type Script } from "./render/script-schema.js";
import { runPreRenderQc } from "./qc/qc-engine.js";
import { loadConfig } from "./config.js";
import { fetchImage } from "./assets/image-fetcher.js";
import { getDurationSec, concatWithSilence, mixSfxOntoVoice, mixBgmWithVoice, type SfxMixSpec } from "./assets/audio-tools.js";
import { ensureEditorialSfx } from "./assets/editorial-sfx.js";
import { indexSfxLibrary, pickSfxForScene, defaultPlayback } from "./assets/sfx-selector.js";
import { existsSync } from "node:fs";
import { composeHtml } from "./render/html-composer.js";
import { renderWithHyperframes } from "./render/hyperframes-runner.js";
import { voiceConfig, studioTts, cachedSpeech } from "./studio/voice.js";
import { prepareImportedVoice } from "./studio/uploads.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { log } from "./utils/logger.js";
import { groupWordsIntoCues } from "./captions/grouper.js";
import { generateSrt } from "./captions/srt.js";
import type { CaptionCue } from "./captions/types.js";
import { processSceneMedia } from "./media/media-manager.js";
import { PexelsProvider, PixabayProvider } from "./media/stock-provider.js";
import { generatePublishChecklist } from "./ingest/publish-kit.js";
import {ensureVideoThumbnail} from './ingest/thumbnail.js';
import {defaultCaption,DEFAULT_BGM} from './channel-defaults.js';

const TOTAL_STEPS = 8;
const DURATION_MIN_SEC = 48;
const DURATION_MAX_SEC = 72;
const SCENE_GAP_SEC = 0.3;
/**
 * Extra seconds added to the outro scene visual duration AFTER the voice ends.
 * Gives the TikTok follow card time to be read by the viewer (otherwise the
 * video ends a few hundred ms after the card slides up + click animation).
 * Audio stays silent during this hold; visual stays on screen.
 */
const OUTRO_HOLD_SEC = 3;

const __dirname = dirname(fileURLToPath(import.meta.url));
const TPL_DIR = join(__dirname, "render", "templates");
/** Path to the SFX library (relative to project root) */
const SFX_DIR = join(__dirname, "..", "assets", "sfx");

const HYPERFRAMES_CONFIG = {
  $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
  registry: "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
  paths: {
    blocks: "compositions",
    components: "compositions/components",
    assets: "assets",
  },
};

export async function runPipeline(scriptPath: string): Promise<void> {
  const raw = JSON.parse(await readFile(scriptPath, "utf8"));
  let cfg = raw.voice?.settingsSource === "script" || raw.voice?.uploadId
    ? loadConfig({ provider: "edge-tts" }) : loadConfig();
  const outputDir = dirname(scriptPath);
  log.info(`Output directory: ${outputDir}`);

  // STEP 1

  // Substitute env placeholder before validation (works for all providers)
  if (raw.voice?.voiceId === "${VIETNAMESE_VOICEID}" || raw.voice?.voiceId === "${VOICE_ID}") {
    raw.voice.voiceId =
      cfg.ttsProvider === "zerotts" ? cfg.zeroTtsVoice
      : cfg.ttsProvider === "edge-tts" ? cfg.edgeTtsVoice
      : cfg.ttsProvider === "lucylab" ? cfg.lucylabVoiceId!
      : cfg.ttsProvider === "elevenlabs" ? cfg.elevenlabsVoiceId!
      : cfg.vbeeVoiceCode;
  }
  const script: Script = ScriptSchema.parse(raw);
  if(!script.voice.uploadId&&referenceSettings(script)){
    cleanScriptNarration(script);
    validateNarrationRepetition(script);
  }
  if(referenceSettings(script))await ensureRepositoryHero(script);
  await hydrateGithubStars(script);
  if(script.narrationTiming||referenceSettings(script))applySpokenGithubHook(script);
  if(script.explanationLevel&&!script.voice.uploadId){
    const measurement=await measureWithShortHook(script,outputDir,measureNarration),report=assessNarration(script,measurement);
    if(!report.accepted)throw new Error(report.feedback);
    script.targetDurationSec=report.targetSec;script.fitDuration=true;
    script.narrationTiming={targetSec:report.targetSec,speechSec:report.speechSec,tempo:report.tempo,hookSec:report.hookSec,attempts:script.narrationTiming?.attempts??1};
    raw.targetDurationSec=script.targetDurationSec;raw.fitDuration=true;raw.narrationTiming=script.narrationTiming;
  }
  if(referenceSettings(script)){
    if(script.metadata.githubStars)raw.metadata.githubStars=script.metadata.githubStars;else delete raw.metadata.githubStars;
    for(const scene of raw.scenes){const updated=script.scenes.find(s=>s.id===scene.id)!;scene.voiceText=updated.voiceText;if(updated.githubHookStyle)scene.githubHookStyle=updated.githubHookStyle;if(updated.media)scene.media=updated.media;if(updated.storyboard)scene.storyboard=updated.storyboard;if(scene.templateData.template==='hook'){scene.githubStarLeadIn=Boolean(script.metadata.githubStars);if(updated.githubStarSpokenPrefix)scene.githubStarSpokenPrefix=updated.githubStarSpokenPrefix;}}
    await writeFile(scriptPath,JSON.stringify(raw,null,2));
  }
  script.bgm ??= {...DEFAULT_BGM};
  if(referenceSettings(script))script.visualStyle='tech-editorial';
  if(script.templatePack){script.visualStyle="tech-editorial";if(script.templatePack==="explainer")script.colorTheme="midnight";}
  cfg = voiceConfig(script.voice);
  log.step(1, TOTAL_STEPS, `Validate script.json (${script.voice.uploadId ? "voice tải lên" : "TTS: " + cfg.ttsProvider})`);
  const reference=referenceSettings(script);
  const gapSec = script.voice.uploadId ? 0 : reference ? reference.gapSec : script.visualStyle === 'tech-editorial' ? 0.08 : SCENE_GAP_SEC;
  const outroHoldSec = reference ? reference.outroHoldSec : script.visualStyle === 'tech-editorial' ? 0.6 : OUTRO_HOLD_SEC;

  // STEP 2
  log.step(2, TOTAL_STEPS, "Write script.txt for CapCut");
  const fullText = script.scenes.map((s) => s.voiceText).join("\n\n");
  await writeFile(join(outputDir, "script.txt"), fullText);

  // STEP 3 + 4 in parallel
  log.step(3, TOTAL_STEPS, "Process media assets & og:image (parallel) + Step 4 TTS");
  const imgPath = join(outputDir, "images", "bg.jpg");
  // Only use og:image as background if explicitly enabled in metadata (M2 compliance)
  const allowOgImage = script.metadata.useOgImage || false;
  const imgPromise = allowOgImage
    ? fetchImage(script.metadata.source.image, imgPath)
    : Promise.resolve({ success: false, reason: "og:image disabled by default for copyright compliance" });

  const stockProvider = process.env.PEXELS_API_KEY
    ? new PexelsProvider(process.env.PEXELS_API_KEY)
    : process.env.PIXABAY_API_KEY
    ? new PixabayProvider(process.env.PIXABAY_API_KEY)
    : undefined;

  const mediaPromise = processSceneMedia(script, outputDir, stockProvider);

  if(!script.voice.uploadId)await writeFile(join(outputDir,'pronunciation-review.json'),JSON.stringify({mode:script.voice.pronunciation||'lexicon',scenes:await Promise.all(script.scenes.map(async s=>({id:s.id,original:s.voiceText,...await preparedPronunciationReport(s.voiceText,script.voice.pronunciation,script.voice.pronunciationOverrides)})))},null,2));

  // STEP 4
  const limit = pLimit(cfg.ttsProvider==='edge-tts'?Math.max(2,cfg.ttsConcurrency):cfg.ttsConcurrency);
  const voiceDir = join(outputDir, "voice");
  await mkdir(voiceDir, { recursive: true });
  const imported = script.voice.uploadId ? await prepareImportedVoice(script, outputDir) : undefined;
  const ttsClient = imported ? undefined : studioTts(cfg, script.voice);
  const sceneAudioPromises = imported ? imported.scenes.map(a => Promise.resolve(a)) : script.scenes.map(scene =>
    limit(async () => ({ id: scene.id, ...await cachedSpeech(scene.voiceText,
      join(voiceDir, `scene-${scene.id}.mp3`), cfg, script.voice.speed, ttsClient!, script.voice.pronunciation, script.voice.pronunciationOverrides) })));

  let [imgResult, mediaResult, sceneAudio] = await Promise.all([
    imgPromise,
    mediaPromise,
    Promise.all(sceneAudioPromises),
  ]);

  if(script.fitDuration && script.targetDurationSec && !imported){
    const result=await fitVoiceDuration(script,sceneAudio,outputDir,gapSec,outroHoldSec);
    sceneAudio=result.voices;
    await writeFile(join(outputDir,'duration-fit.json'),JSON.stringify({targetSec:script.targetDurationSec,tempo:result.tempo,expectedSec:sceneAudio.reduce((n,a)=>n+a.durationSec+gapSec,0)+outroHoldSec},null,2));
    log.info(`Cân thời lượng ${script.targetDurationSec}s, tempo ${result.tempo.toFixed(3)}x; giữ toàn bộ lời đọc.`);
  }

  let bgImageRelPath: string | null = null;
  if (imgResult.success) {
    bgImageRelPath = "images/bg.jpg";
  } else {
    log.warn(`Background image fetch failed: ${imgResult.reason} → using gradient fallback`);
  }

  // STEP 5
  log.step(5, TOTAL_STEPS, "Concat voice scenes + mix SFX layer");
  const voiceRawMp3 = join(outputDir, "voice-raw.mp3");
  const voiceMp3 = join(outputDir, "voice.mp3");
  if (imported) {
    await promisify(execFile)('ffmpeg', ['-v', 'error', '-y', '-i', join(outputDir, 'imported-voice.wav'), '-c:a', 'libmp3lame', '-b:a', '192k', voiceRawMp3]);
  } else await concatWithSilence(sceneAudio.map((a) => a.path), gapSec, voiceRawMp3);

  // Compute scene start times (cumulative voice durations + gaps)
  let cursor = 0;
  const sceneStarts: Record<string, number> = {};
  for (const a of sceneAudio) {
    sceneStarts[a.id] = cursor;
    cursor += a.durationSec + gapSec;
  }

  // Build SFX mix list using smart 3-tier selector
  const sfxIndex = indexSfxLibrary(SFX_DIR);
  const indexCats = Object.keys(sfxIndex).length;
  const indexFiles = Object.values(sfxIndex).reduce((s, a) => s + a.length, 0);
  log.info(`  SFX library: ${indexFiles} files in ${indexCats} categories`);

  const editorialSfx = script.motionPreset === "dynamic" && script.soundDesign ? await ensureEditorialSfx(join(outputDir,"sfx")) : undefined;
  const sfxList: SfxMixSpec[] = [];
  for (const scene of script.scenes) {
    const startSec = sceneStarts[scene.id];
    if (script.soundDesign === false) continue;

    // Tier 1: explicit override in script.json
    if (scene.sfx) {
      if (scene.sfx.name === "none") {
        log.info(`  scene ${scene.id}: SFX disabled (explicit "none")`);
        continue;
      }
      const sfxPath = join(SFX_DIR, `${scene.sfx.name}.mp3`);
      if (existsSync(sfxPath)) {
        sfxList.push({ path: sfxPath, startSec: startSec + scene.sfx.startOffsetSec, volume: scene.sfx.volume });
        log.info(`  scene ${scene.id}: SFX override -> ${scene.sfx.name}.mp3`);
      } else {
        log.warn(`  scene ${scene.id}: explicit SFX not found, skipping: ${scene.sfx.name}.mp3`);
      }
      continue;
    }

    if (editorialSfx) {
      const path = scene.type === 'hook' || scene.type === 'outro' ? editorialSfx.whoosh : editorialSfx.tick;
      sfxList.push({ path, startSec: startSec + 0.06, volume: scene.type === 'hook' ? 0.18 : 0.13 });
      continue;
    }

    // Tier 2/3: smart selection by content + template
    const picked = pickSfxForScene({
      voiceText: scene.voiceText,
      templateName: scene.templateData.template,
      sceneId: scene.id,
      index: sfxIndex,
    });
    if (!picked) {
      log.warn(`  scene ${scene.id}: no SFX available (empty library?)`);
      continue;
    }

    const sfxPath = join(SFX_DIR, picked.relPath);
    const playback = defaultPlayback(picked);
    sfxList.push({ path: sfxPath, startSec: startSec + playback.offsetSec, volume: playback.volume });

    const why = picked.source === "semantic"
      ? `semantic match "${picked.matchedKeyword}"`
      : picked.source;
    log.info(`  scene ${scene.id}: SFX -> ${picked.relPath} (${why})`);
  }
  log.info(`  mixing ${sfxList.length} SFX into voice.mp3`);
  await mixSfxOntoVoice(voiceRawMp3, sfxList, voiceMp3);

  // STEP 5.1 (M5): Mix Background Music (BGM) with ducking
  if (script.bgm?.src && script.bgm.enabled !== false) {
    let bgmFile = script.bgm.src;
    if (!existsSync(bgmFile)) {
      const candidate = join(process.cwd(), bgmFile);
      if (existsSync(candidate)) bgmFile = candidate;
    }
    if (existsSync(bgmFile)) {
      const vol = script.bgm.volume ?? DEFAULT_BGM.volume;
      const duck = script.bgm.duck ?? true;
      const duckVol = script.bgm.duckVolume ?? 0.06;
      log.info(`  mixing BGM: ${script.bgm.src} (vol=${vol}, duck=${duck})`);
      const tempMixed = join(outputDir, "voice-before-bgm.mp3");
      await copyFile(voiceMp3, tempMixed);
      await mixBgmWithVoice(tempMixed, bgmFile, voiceMp3, {
        volume: vol,
        duck,
        duckVolume: duckVol,
        durationSec: sceneAudio.reduce((n,a)=>n+a.durationSec+gapSec,0)+outroHoldSec,
      });
    } else {
      log.warn(`  BGM file not found: ${script.bgm.src} — skipping BGM`);
    }
  }

  const totalAudioSec = await getDurationSec(voiceMp3);
  log.info(`  voice.mp3 total: ${totalAudioSec.toFixed(2)}s`);

  // Preset duration tolerance check (M5)
  let minTolerance = DURATION_MIN_SEC;
  let maxTolerance = DURATION_MAX_SEC;
  if (script.preset === "short_30") {
    minTolerance = 25;
    maxTolerance = 38;
  } else if (script.preset === "news_45") {
    minTolerance = 38;
    maxTolerance = 55;
  } else if (script.preset === "review_60") {
    minTolerance = 55;
    maxTolerance = 75;
  }

  if(script.fitDuration && script.targetDurationSec){
    minTolerance=script.targetDurationSec-outroHoldSec-.15;
    maxTolerance=script.targetDurationSec+.15;
  }
  if (totalAudioSec < minTolerance || totalAudioSec > maxTolerance) {
    log.warn(`Total duration ${totalAudioSec.toFixed(1)}s outside preset [${minTolerance}, ${maxTolerance}]s tolerance — proceeding anyway`);
  }

  // Build global captions (M1)
  const allCues: CaptionCue[] = [];
  let cueIdCounter = 1;
  for (const a of sceneAudio) {
    const startSec = sceneStarts[a.id];
    const sceneStartMs = Math.round(startSec * 1000);
    const sceneCues = groupWordsIntoCues(a.words, { sceneStartMs }, cueIdCounter);
    cueIdCounter += sceneCues.length;
    allCues.push(...sceneCues.map(c => ({ ...c, accuracy: a.accuracy,
      endMs: Math.min(c.endMs, sceneStartMs + Math.round(a.durationSec * 1000)),
      endSec: Math.min(c.endSec, startSec + a.durationSec) })));
  }

  if (imported?.cues) allCues.splice(0, allCues.length, ...imported.cues);
  for (let i = 0; i < allCues.length - 1; i++) {
    allCues[i].endMs = Math.min(allCues[i].endMs, allCues[i + 1].startMs);
    allCues[i].endSec = allCues[i].endMs / 1000;
  }
  await writeFile(join(outputDir, 'timing-quality.json'), JSON.stringify({
    source: imported ? (imported.cues ? 'imported-srt' : 'estimated') : 'tts',
    wordAccuracy: allCues.every(c => c.accuracy === 'high') ? 'high' : 'low',
    sceneTiming: imported && !script.voice.sceneBoundaries ? 'estimated' : 'audio'
  }, null, 2));

  // Export captions.srt and captions.json for the full video
  const srtContent = generateSrt(allCues);
  await writeFile(join(outputDir, "captions.srt"), srtContent, "utf8");
  await writeFile(join(outputDir, "captions.json"), JSON.stringify(allCues, null, 2), "utf8");
  log.info(`  Captions: exported ${allCues.length} cues → captions.srt & captions.json`);

  if (script.voice.settingsSource === 'script' || imported) {
    script.schemaVersion = 2;
    script.timeline = { scenes: Object.fromEntries(sceneAudio.map(a => [a.id, {
      start: sceneStarts[a.id], duration: a.durationSec + gapSec + (script.scenes.find(s => s.id === a.id)?.type === 'outro' ? outroHoldSec : 0)
    }])), captionCues: allCues.map(c => ({ start: c.startSec, end: c.endSec, text: c.text })) };
    await writeFile(scriptPath, JSON.stringify(script, null, 2));
  }

  // STEP 6 — Compose HTML + write hyperframes project files
  log.step(6, TOTAL_STEPS, "Compose HTML + project files");

  // Resolve TikTok avatar — download URL if provided, else copy bundled default
  // Bundled avatar can be jpg/jpeg/png/webp — pick whichever exists
  const findBundledAvatar = (): string => {
    const baseDir = join(__dirname, "..", "assets");
    for (const ext of ["jpg", "jpeg", "png", "webp"]) {
      const p = join(baseDir, `avatar.${ext}`);
      if (existsSync(p)) return p;
    }
    throw new Error(`No bundled avatar found. Place an image at assets/avatar.{jpg,png,webp}`);
  };
  const bundledAvatar = findBundledAvatar();
  const ttAvatarExt = bundledAvatar.split(".").pop()!.toLowerCase();
  const ttAvatarFile = `tiktok-avatar.${ttAvatarExt}`;
  const ttAvatarOut = join(outputDir, ttAvatarFile);
  if (cfg.tiktok.avatarUrl) {
    const r = await fetchImage(cfg.tiktok.avatarUrl, ttAvatarOut);
    if (!r.success) {
      log.warn(`TikTok avatar download failed: ${r.reason} → falling back to bundled default`);
      await copyFile(bundledAvatar, ttAvatarOut);
    }
  } else {
    await copyFile(bundledAvatar, ttAvatarOut);
  }

  const html = composeHtml({
    script,
    sceneAudio: sceneAudio.map((a) => ({ id: a.id, durationSec: a.durationSec })),
    gapSec,
    bgImageRelPath,
    audioRelPath: "voice.mp3",
    tiktok: cfg.tiktok,
    tiktokAvatarRelPath: ttAvatarFile,
    outroHoldSec,
    captionCues: allCues,
    mediaMap: mediaResult.mediaMap,
  });

  // hyperframes expects: index.html (NOT composition.html), hyperframes.json, meta.json in DIR
  await writeFile(join(outputDir, "index.html"), html);

  await writeFile(join(outputDir, "hyperframes.json"), JSON.stringify(HYPERFRAMES_CONFIG, null, 2));

  const slug = basename(outputDir);
  await writeFile(join(outputDir, "meta.json"), JSON.stringify({
    id: slug,
    name: script.metadata.title,
    createdAt: new Date().toISOString(),
  }, null, 2));

  // Copy templates next to the index.html so relative paths resolve.
  // base.html.tmpl + animations.js are shared across themes (structure/behavior);
  // only styles.<theme>.css differs (visual look), and always lands as "styles.css".
  const themeFile = cfg.videoTheme === "light-pro" ? "styles.light-pro.css" : "styles.css";
  await copyFile(join(TPL_DIR, themeFile), join(outputDir, "styles.css"));
  if (script.visualStyle === 'tech-editorial') {
    const baseCss = stripCssImports(await readFile(join(TPL_DIR, 'styles.css'), 'utf8'));
    await writeFile(join(outputDir, 'styles.css'), baseCss + '\n' + await readFile(join(TPL_DIR, 'styles.tech-editorial.css'), 'utf8'));
    await mkdir(join(outputDir, 'fonts'), { recursive: true });
    await copyFile(join(__dirname, '../assets/fonts/BeVietnamPro-Bold.ttf'), join(outputDir, 'fonts/BeVietnamPro-Bold.ttf'));
    await copyFile(join(__dirname, '../assets/fonts/OFL.txt'), join(outputDir, 'fonts/OFL.txt'));
    await copyFile(createRequire(import.meta.url).resolve('gsap/dist/gsap.min.js'), join(outputDir, 'gsap.min.js'));
  }
  await writeFile(join(outputDir,'styles.css'),await readFile(join(outputDir,'styles.css'),'utf8')+'\n'+await readFile(join(TPL_DIR,'styles.follow-card.css'),'utf8'));
  await copyFile(join(TPL_DIR, "animations.js"), join(outputDir, "animations.js"));

  // STEP 6.5: Quality Control Engine Validation
  const qcReport = runPreRenderQc({
    script,
    totalDurationSec: totalAudioSec,
    cues: allCues,
    renderedHtml: html,
  });
  await writeFile(join(outputDir, "qc-report.json"), JSON.stringify(qcReport, null, 2), "utf8");
  if (!qcReport.passed) {
    const errorDetails = qcReport.blockingErrors.join("\n - ");
    log.error(`QC Engine BLOCKED rendering due to critical issues:\n - ${errorDetails}`);
    throw new Error(`QC Engine BLOCKED rendering (${qcReport.blockingCount} critical errors):\n - ${errorDetails}`);
  }
  if (qcReport.warnings.length > 0) {
    log.warn(`QC Engine Warnings (${qcReport.warnings.length}):\n - ${qcReport.warnings.join("\n - ")}`);
  }
  log.info(`QC Engine passed with score: ${qcReport.score}/100.`);

  // STEP 7
  log.step(7, TOTAL_STEPS, "Render with hyperframes");
  const videoPath = join(outputDir, "video.mp4");
  await renderWithHyperframes({ compositionDir: outputDir, outputPath: videoPath,fps:script.renderSettings?.fps??30,workers:script.renderSettings?.workers??2,quality:script.renderSettings?.quality??'standard' });

  // STEP 8
  log.step(8, TOTAL_STEPS, "Generate publish kit (publish.md + cover.png) & Finalize");
  const publishMd = generatePublishChecklist(
    {
      suggestedTitle: script.metadata.title,
      channelName: script.metadata.channel,
      sourceUrl: script.metadata.source.url,
      sourceName: script.metadata.source.domain,
    },
    script
  );
  await writeFile(join(outputDir, "publish.md"), publishMd, "utf8");
  await writeFile(join(outputDir, 'caption.txt'), defaultCaption(script.metadata.title), 'utf8');

  // Extract cover frame if video exists
  const coverPath = join(outputDir, "cover.png");
  if (existsSync(videoPath)) {
    try {
      await ensureVideoThumbnail(videoPath, coverPath);
      log.info(`  Cover thumbnail: ${coverPath}`);
    } catch (coverErr: any) {
      log.warn(`  Could not extract cover frame: ${coverErr.message}`);
    }
  }

  console.log("\n=== Result ===");
  console.log(`Video:   ${videoPath}`);
  console.log(`Audio:   ${voiceMp3}  (cho CapCut)`);
  console.log(`Script:  ${join(outputDir, "script.txt")}  (cho CapCut auto-caption)`);
  console.log(`Publish: ${join(outputDir, "publish.md")}`);
  console.log(`Cover:   ${coverPath}`);
  console.log(`Tong thoi luong: ${totalAudioSec.toFixed(2)}s`);
}
