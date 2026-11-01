import { mkdir, copyFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import axios from "axios";
import { readVisual } from "../studio/visuals.js";
import type { Script, MediaSpecType } from "../render/script-schema.js";
import { StockProvider } from "./stock-provider.js";
import { captureUrlScreenshot } from "./screenshot.js";
import { log } from "../utils/logger.js";
import {imageSize} from './image-size.js';

export interface MediaAssetRecord {
  width?:number;
  height?:number;
  sceneId: string;
  type: "image" | "video" | "screenshot";
  originalSrc: string;
  localRelPath: string; // Relative to outputDir, e.g. "media/scene-hook.jpg"
  fit: "cover" | "contain";
  fx: "none" | "kenburns";
  presentation?: "background" | "card" | "logo";
  credit?: string;
  license?: string;
  copyrightWarning?: string;
}

export interface MediaResolveResult {
  mediaRecords: MediaAssetRecord[];
  mediaMap: Record<string, MediaAssetRecord>;
}

/**
 * Download a remote image/video with size limits.
 */
async function downloadFile(url: string, destPath: string, maxBytes = 30 * 1024 * 1024): Promise<boolean> {
  try {
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 15000,
      maxContentLength: maxBytes,
    });
    const buffer = Buffer.from(response.data);
    await writeFile(destPath, buffer);
    return true;
  } catch (err: any) {
    log.warn(`Failed to download media file from ${url}: ${err.message}`);
    return false;
  }
}

/**
 * Process all media assets declared in script scenes and write media.json.
 */
export function sceneMediaEntries(script:Script):{id:string;media:MediaSpecType}[]{
  const entries: {id:string;media:MediaSpecType}[]=[];
  for(const scene of script.scenes){
    if(scene.media)entries.push({id:scene.id,media:scene.media});
    const td=scene.templateData;
    if(td.template==='phone-mockup'&&!scene.media)entries.push({id:scene.id,media:{type:'image',src:td.screenSrc,fit:'contain',fx:'none'}});
    if(td.template==='image-gallery')td.images.forEach((image,i)=>{if(i!==0||!scene.media)entries.push({id:`${scene.id}:gallery:${i}`,media:{type:'image',src:image.src,fit:'contain',fx:'none'}});});
  }
  return entries;
}

export async function processSceneMedia(script:Script,outputDir:string,stockProvider?:StockProvider):Promise<MediaResolveResult>{
  const mediaDir=join(outputDir,'media');await mkdir(mediaDir,{recursive:true});
  const mediaRecords:MediaAssetRecord[]=[],mediaMap:Record<string,MediaAssetRecord>={};
  for (const scene of sceneMediaEntries(script)) {
    const spec = scene.media;

    const destFileName = `scene-${scene.id.replace(/:/g,'-')}`;
    let resolvedRelPath: string | null = null;
    let credit = spec.credit;
    let license = spec.license;
    let copyrightWarning: string | undefined;
    const inProject=spec.src.startsWith('media/')&&!spec.src.split(/[\\/]/).includes('..')?join(outputDir,spec.src):undefined;

    // Validated local Studio asset identifier or visual URL, copied into the self-contained render.
    const studioMatch = spec.src.match(/^(?:studio-asset:|\/api\/studio\/visuals\/)([0-9a-f-]{36})/i);
    if (studioMatch) {
      const asset = await readVisual(studioMatch[1]);
      await copyFile(asset.path, join(mediaDir, `${destFileName}.png`));
      resolvedRelPath = `media/${destFileName}.png`;
      credit = credit || asset.source;
    }
    // Case 1: Local file path
    else if (existsSync(spec.src) || inProject&&existsSync(inProject)) {
      const sourcePath=existsSync(spec.src)?spec.src:inProject!;
      const ext = extname(spec.src) || (spec.type === "video" ? ".mp4" : ".jpg");
      const destPath = join(mediaDir, `${destFileName}${ext}`);
      try {
        if(resolve(sourcePath)!==resolve(destPath))await copyFile(sourcePath, destPath);
        resolvedRelPath = `media/${destFileName}${ext}`;
        log.info(`  scene ${scene.id}: copied local media -> ${resolvedRelPath}`);
      } catch (err: any) {
        log.warn(`  scene ${scene.id}: failed to copy ${spec.src}: ${err.message}`);
      }
    }
    // Case 2: Screenshot of a URL
    else if (spec.type === "screenshot" && (spec.src.startsWith("http://") || spec.src.startsWith("https://"))) {
      const destPath = join(mediaDir, `${destFileName}.jpg`);
      log.info(`  scene ${scene.id}: capturing screenshot of ${spec.src}...`);
      const r = await captureUrlScreenshot(spec.src, destPath);
      if (r.success) {
        resolvedRelPath = `media/${destFileName}.jpg`;
        credit = credit || `Screenshot of ${new URL(spec.src).hostname}`;
        license = license || "Fair Use / Screenshot citation";
        log.info(`  scene ${scene.id}: screenshot captured -> ${resolvedRelPath}`);
      } else {
        log.warn(`  scene ${scene.id}: ${r.reason} → using gradient fallback`);
      }
    }
    // Case 3: Stock query via StockProvider (e.g. "stock:artificial intelligence")
    else if (spec.src.startsWith("stock:") && stockProvider) {
      const query = spec.src.replace(/^stock:/, "").trim();
      log.info(`  scene ${scene.id}: searching stock media for "${query}"...`);
      try {
        if (spec.type === "video") {
          const results = await stockProvider.searchVideos(query, 1);
          if (results.length > 0) {
            const hit = results[0];
            const destPath = join(mediaDir, `${destFileName}.mp4`);
            const ok = await downloadFile(hit.url, destPath);
            if (ok) {
              resolvedRelPath = `media/${destFileName}.mp4`;
              credit = credit || hit.photographer || hit.source;
              license = license || hit.license;
            }
          }
        } else {
          const results = await stockProvider.searchPhotos(query, 1);
          if (results.length > 0) {
            const hit = results[0];
            const destPath = join(mediaDir, `${destFileName}.jpg`);
            const ok = await downloadFile(hit.url, destPath);
            if (ok) {
              resolvedRelPath = `media/${destFileName}.jpg`;
              credit = credit || hit.photographer || hit.source;
              license = license || hit.license;
            }
          }
        }
      } catch (err: any) {
        log.warn(`  scene ${scene.id}: stock search failed: ${err.message}`);
      }
    }
    // Case 4: Remote HTTP/HTTPS image or video URL
    else if (spec.src.startsWith("http://") || spec.src.startsWith("https://")) {
      const isVideo = spec.type === "video";
      const ext = extname(new URL(spec.src).pathname) || (isVideo ? ".mp4" : ".jpg");
      const destPath = join(mediaDir, `${destFileName}${ext}`);
      log.info(`  scene ${scene.id}: downloading media from ${spec.src}...`);
      const ok = await downloadFile(spec.src, destPath);
      if (ok) {
        resolvedRelPath = `media/${destFileName}${ext}`;
        credit = credit || new URL(spec.src).hostname;
        license = license || "Editorial / Source Attribution";
      } else {
        log.warn(`  scene ${scene.id}: download failed, using default background`);
      }
    }

    if (resolvedRelPath) {
      const record: MediaAssetRecord = {
        sceneId: scene.id,
        type: spec.type,
        originalSrc: spec.src,
        localRelPath: resolvedRelPath,
        presentation: spec.presentation,
        fit: spec.fit,
        fx: spec.fx,
        credit,
        license,
        copyrightWarning,
      };
      if(spec.type!=='video')try{Object.assign(record,await imageSize(join(outputDir,resolvedRelPath)));}catch{/* The render preflight validates referenced image files. */}
      mediaRecords.push(record);
      mediaMap[scene.id] = record;
    }
  }

  if (script.metadata.logoAssetId) {
    const asset=await readVisual(script.metadata.logoAssetId);
    await copyFile(asset.path,join(mediaDir,'project-logo.png'));
    const logo:MediaAssetRecord={sceneId:'__logo__',type:'image',originalSrc:asset.source,localRelPath:'media/project-logo.png',fit:'contain',fx:'none',credit:asset.source};
    mediaRecords.push(logo);mediaMap.__logo__=logo;
  }

  // Handle article og:image if useOgImage is explicitly enabled
  const ogImage = script.metadata.source.image;
  if (ogImage && script.metadata.useOgImage) {
    const destPath = join(mediaDir, "og-image.jpg");
    const ok = await downloadFile(ogImage, destPath);
    if (ok) {
      mediaRecords.push({
        sceneId: "__og_image__",
        type: "image",
        originalSrc: ogImage,
        localRelPath: "media/og-image.jpg",
        fit: "cover",
        fx: "none",
        credit: script.metadata.source.domain,
        license: "Editorial rights belong to publisher",
        copyrightWarning: "ATTENTION: og:image may be copyrighted by original publisher. Ensure fair use.",
      });
    }
  }

  // Save media.json manifest
  await writeFile(
    join(outputDir, "media.json"),
    JSON.stringify(mediaRecords, null, 2),
    "utf8"
  );
  log.info(`  Media: processed ${mediaRecords.length} asset(s) → media.json`);

  return { mediaRecords, mediaMap };
}

