import {EXPLANATION_LEVELS,type ExplanationLevel} from '../studio/explanation-level.js';
import {measureDraftAudio,NarrationAudioError} from './measured-hook.js';
import {cleanScriptNarration} from './narration-cleanup.js';
import {fetchGithubStars,applySpokenGithubHook} from './github-stars.js';
import {parseRepoUrl} from './github-source.js';
import {repositoryPronunciation} from './repository-pronunciation.js';
import {mergePronunciationOverrides} from '../tts/lexicon.js';
import {retimeNarration} from './retime-narration.js';
import {assessNarration,type NarrationMeasurement} from '../studio/narration-timing.js';
import {applyReferenceDefaults,type CreativeSettings} from '../render/reference-design.js';
import {applyChannelOutro} from "./channel-outro.js";
import {DEFAULT_VOICE_SPEED,DEFAULT_BGM,DEFAULT_VOICE} from '../channel-defaults.js';
import {reviewStoryboard,prioritizePracticalExample,validatePracticalExamples} from "./storyboard.js";
import { z } from "zod";
import { validateNarration } from "./narration-quality.js";
import { validateCoverage, reviewCoverage } from "./coverage.js";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ScriptSchema, type Script } from "../render/script-schema.js";
import { createLlmProvider } from "./llm-provider.js";
import { fetchSourceContent } from "./source-fetcher.js";
import { SYSTEM_PROMPT } from "./prompts/system-prompt.js";
import { buildUserPrompt, buildRetryPrompt } from "./prompts/user-prompt.js";
import { factCheckScript } from "./fact-checker.js";
import type { GenerateScriptResult, LLMProvider, ScriptPreset, SourceContent } from "./types.js";
import { log } from "../utils/logger.js";
import { toSlug } from "../utils/slug.js";

/**
 * Strips markdown code fence blocks if LLM accidentally outputs them.
 */
export function cleanLlmJson(raw: string): string {
  let text = raw.trim();
  // Remove markdown code fences: ```json ... ``` or ``` ... ```
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "");
    text = text.replace(/```\s*$/i, "");
  }
  // Repair only trailing commas outside JSON strings; code and narration stay literal.
  let result='',quoted=false,escaped=false;
  for(let i=0;i<text.length;i++){
    const char=text[i];
    if(quoted){
      result+=char;
      if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;
      continue;
    }
    if(char==='"')quoted=true;
    if(char===','){
      let next=i+1;while(/\s/.test(text[next]||'')&&next<text.length)next++;
      if(text[next]==='}'||text[next]===']')continue;
    }
    result+=char;
  }
  return result.trim();
}

/**
 * Generates markdown review content for user verification.
 */
export function buildReviewMarkdown(
  script: Script,
  sources: SourceContent,
  preset: ScriptPreset,
  factCheck: ReturnType<typeof factCheckScript>,
): string {
  const totalWords = script.scenes.reduce((acc, s) => acc + s.voiceText.split(/\s+/).length, 0);
  const estSeconds = (totalWords / 2.7).toFixed(1);
  const timingLine=script.narrationTiming ? `Đã đo TTS: ${script.narrationTiming.speechSec.toFixed(1)} giây lời đọc | Mục tiêu video: ${script.targetDurationSec} giây | Hook sau cân: ${script.narrationTiming.hookSec.toFixed(1)} giây` : `Thời lượng ước tính: ~${estSeconds} giây`;

  let warningSection = "";
  if (factCheck.flaggedNumbers.length > 0) {
    warningSection = `
> [!WARNING] CẢNH BÁO SỐ LIỆU CHƯA XÁC MINH (${factCheck.flaggedNumbers.length} số)
> Các con số dưới đây xuất hiện trong kịch bản nhưng KHÔNG tìm thấy trong bài viết gốc. Vui lòng kiểm tra lại trước khi render:
${factCheck.flaggedNumbers
  .map(
    (f) =>
      `- Cảnh **${f.sceneId}**: Con số \`${f.number}\` trong ngữ cảnh "${f.context}"`,
  )
  .join("\n")}
`;
  } else {
    warningSection = `> [!NOTE] Tất cả ${factCheck.totalChecked} con số trong kịch bản đã được xác thực khớp với nguồn!`;
  }

  const scenesTable = script.scenes
    .map((s, idx) => {
      const template = s.templateData.template;
      const preview =
        template === "spec-table"
          ? (s.templateData as any).specs.map((sp: any) => `${sp.label}: ${sp.value}`).join(", ")
          : template === "pros-cons"
          ? `Pros: ${(s.templateData as any).pros.join("; ")}`
          : template === "verdict-score"
          ? `Score: ${(s.templateData as any).score}/${(s.templateData as any).scale}`
          : template === "price-tag"
          ? `Price: ${(s.templateData as any).price}`
          : JSON.stringify(s.templateData).slice(0, 60);

      return `| ${idx + 1} | \`${s.id}\` | \`${s.type}\` | \`${template}\` | ${s.voiceText} | ${preview} |`;
    })
    .join("\n");

  return `# Báo cáo Duyệt Kịch bản: ${script.metadata.title}

- **Nguồn bài viết:** [${sources.domain}](${sources.url})
- **Preset:** \`${preset}\` | **Số cảnh:** ${script.scenes.length}
- **Tổng số từ:** ~${totalWords} từ | ${timingLine}

${warningSection}

---

## Chi tiết từng cảnh

| # | ID | Loại | Template | Voice Text (Đọc bằng TTS) | Nội dung hiển thị trên màn hình |
|---|---|---|---|---|---|
${scenesTable}

---

## Hướng dẫn bước tiếp theo
1. Kiểm tra kỹ nội dung và các con số trên bảng.
2. Nếu cần sửa, chỉnh sửa trực tiếp file \`script.json\` trong thư mục này.
3. Chạy lệnh sau để tiến hành render video thành phẩm:
\`\`\`bash
npm run pipeline -- <thư mục>/script.json
\`\`\`
`.trim();
}

export interface GenerateScriptOptions {
  explanationLevel?: ExplanationLevel;
  creative?: CreativeSettings;
  voice?: Script['voice'];
  measureNarration?: (script:Script,outDir:string)=>Promise<NarrationMeasurement>;
  input: string;
  preset?: ScriptPreset;
  outputDir?: string;
  llmProvider?: LLMProvider;
  channelName?: string;
  source?: SourceContent;
  contentMode?: "overview" | "deep-dive";
  targetDurationSec?: number;
  directingMode?: "auto";
  visualAssets?: {id:string;label:string;source:string;kind?:string}[];
}

/**
 * Main script generator pipeline with LLM calling, Zod validation, retry loop, and fact-checking.
 */
export async function generateScript(opts: GenerateScriptOptions): Promise<GenerateScriptResult> {
  if(opts.explanationLevel)opts={...opts,targetDurationSec:EXPLANATION_LEVELS[opts.explanationLevel].preferredSec,contentMode:opts.explanationLevel==='quick'?'overview':'deep-dive',directingMode:'auto'};
  const {
    input,
    preset = "news_short",
    llmProvider = createLlmProvider(),
    channelName = "DevPeek36",
  } = opts;

  // 1. Fetch source content
  log.info(`[1/4] Fetching source content from: ${input.slice(0,160)}`);
  const sources = opts.source || await fetchSourceContent(input);

  // 2. Prepare output directory
  const slug = toSlug(sources.title).slice(0, 30);
  const timestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
  const outDir = opts.outputDir || join("output", `${slug}-${timestamp}`);
  await mkdir(outDir, { recursive: true });

  // 3. Call LLM with retry mechanism (max 2 retries = 3 attempts total)
  log.info(`[2/4] Generating script with LLM (${llmProvider.name})...`);
  const verifiedStars=opts.measureNarration?await fetchGithubStars(sources.url):undefined;
  let sourceRepoUrl:string|undefined;
  try{sourceRepoUrl=parseRepoUrl(sources.url).url;}catch{}
  const repoPronunciation=opts.voice?.uploadId||opts.voice?.pronunciation==='original'?{}:await repositoryPronunciation(sources.url,llmProvider,opts.voice?.pronunciationOverrides);
  const initialUserPrompt = buildUserPrompt(sources, preset, channelName, {explanationLevel:opts.explanationLevel,contentMode:opts.contentMode,targetDurationSec:opts.targetDurationSec,directingMode:opts.directingMode,visualAssets:opts.visualAssets}) + `\nMỞ ĐẦU: ${opts.creative?.hookType==='question'?'Đặt câu hỏi cụ thể, trả lời ngay bằng bằng chứng từ nguồn.':'Vấn đề có thật trong nguồn → giải pháp → lợi ích; thiếu vấn đề thì mở bằng tính năng thật, không bịa nỗi đau.'}\nCẤU TRÚC: ${opts.creative?.structureId==='news'?'Sự kiện → bằng chứng → tác động → giới hạn → CTA.':opts.creative?.structureId==='review'?'Giải pháp → lợi ích → bằng chứng → cách dùng → giới hạn → CTA.':'Giải pháp → cơ chế → tính năng → cách dùng → giới hạn → CTA.'} Bỏ mục không có dữ liệu. Thẻ có chữ ngắn gọn, nội dung bổ sung dần theo lời đọc; không chép toàn bộ lời đọc lên hình. Không sao chép số liệu hay branding của video tham chiếu.
LỜI HOOK: viết câu lợi ích khác biệt có trong nguồn trong 8–12 tiếng. Không mở bằng "Là repo", "Đây là một repo", không lặp tên repo giữa hai cảnh. Với nguồn GitHub, hệ thống tự chèn tên repo lấy từ URL trước câu lợi ích; KHÔNG viết lại tên repo trong voiceText hook. ${verifiedStars?`Hệ thống cũng chèn số sao thật (${verifiedStars.count} sao GitHub). KHÔNG tự viết lại số sao vào voiceText.`:""} Giữ câu lợi ích ngắn để tổng hook gồm tên repo và số sao dưới 6 giây.
THIẾT KẾ MỞ ĐẦU: templateData.hero={name,category,repository?,before?,after?}. name chỉ là tên sản phẩm ngắn lấy từ nguồn, không phải câu hook. category là loại sản phẩm; repository chỉ điền repo thật. before/after là hai nhãn đối chiếu ngắn, chỉ khi nguồn xác nhận. voiceText mở bằng tương phản vấn đề → giải pháp theo lối "Thay vì…" khi có bằng chứng; không lặp lại tên lên headline như câu khẩu hiệu. headline vẫn là tóm tắt ý hook cho tương thích.
BẢNG NỘI DUNG: ${opts.explanationLevel&&sourceRepoUrl?'Ưu tiên worked-example ngay sau hook và các tình huống khác nhau theo mức giải thích. Không thay ví dụ bằng data-flow tổng quát. ':''}Dùng data-flow cho kiến trúc tổng quát, feature-list cho tính năng chưa được minh họa, code-window cho hướng dẫn, pros-cons cho giới hạn. Có thể thêm scene.referenceBoard={rows:[{title,detail,tone,badge?,disabled?}],cards:[{label,value,detail?,tone}]} để BỔ SUNG dần các khối trên cùng bảng, không tách mọi ý thành slide mới. Tối đa 2 rows và 2 cards khi đã có panel cơ chế; mỗi chữ và số đều phải có trong nguồn. tone là mint/red/blue/gold/violet. Giữ tối đa khoảng 5 khối chính trên một bảng. Không tự tạo số đo hiệu năng hay badge ngụ ý đã kiểm chứng.`;

  let currentPrompt = initialUserPrompt;
  let parsedScript: Script | null = null;
  let lastRawResponse = "";
  const MAX_RETRIES = opts.measureNarration ? 4 : 2;
  let transientRetries=0;
  let repairCandidate:Script|undefined;
  let repairMeasurement:NarrationMeasurement|undefined;
  let repairFeedback="";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        log.warn(`  Retry attempt ${attempt}/${MAX_RETRIES} due to validation error...`);
      }

      if(repairCandidate && repairMeasurement){
        lastRawResponse=JSON.stringify(await retimeNarration(llmProvider,repairCandidate,sources,repairMeasurement,repairFeedback));
      }else{
      lastRawResponse = await llmProvider.generate(`${SYSTEM_PROMPT}\n\nJSON SCHEMA CHÍNH XÁC (mọi scene phải có id, type, voiceText, templateData; templateData.template là tên template):\n${JSON.stringify(z.toJSONSchema(ScriptSchema, { unrepresentable: "any" }))}`, currentPrompt);
      }
      const cleaned = cleanLlmJson(lastRawResponse);
      const parsedJson = JSON.parse(cleaned);
      delete parsedJson.narrationTiming;
      parsedJson.bgm = {...DEFAULT_BGM};
      // An LLM may invent optional editor settings; generated videos start clean.
      if (parsedJson.metadata && typeof parsedJson.metadata === 'object') {
        parsedJson.metadata.safeZoneOverlay = false;
        delete parsedJson.metadata.githubStars;
      }
      if (parsedJson.voice && typeof parsedJson.voice === 'object') {
        parsedJson.voice.speed = DEFAULT_VOICE_SPEED;
        parsedJson.voice.pronunciationOverrides=mergePronunciationOverrides(parsedJson.voice.pronunciationOverrides,repoPronunciation);
      }

      // Validate with ScriptSchema
      if(opts.contentMode){
        parsedJson.contentMode=opts.contentMode;
        parsedJson.schemaVersion=2;
        parsedJson.preset=preset==='review_60'?'review_60':opts.targetDurationSec===30?'short_30':'news_45';
        parsedJson.metadata={...parsedJson.metadata,channel:channelName,source:{url:sources.url,domain:sources.domain,image:sources.ogImage}};
        parsedJson.captions={enabled:true,style:'minimal'};
        parsedJson.voice={...parsedJson.voice,provider:'edge-tts',voiceId:'vi-VN-NamMinhNeural',speed:DEFAULT_VOICE_SPEED,pronunciation:'lexicon'};
      }
      if(opts.contentMode)applyChannelOutro(parsedJson,channelName);
      if(sourceRepoUrl&&parsedJson.metadata)parsedJson.metadata.source={...parsedJson.metadata.source,url:sourceRepoUrl,domain:'github.com'};
      if(opts.directingMode)parsedJson.directingMode=opts.directingMode;
      if(opts.targetDurationSec)parsedJson.targetDurationSec=opts.targetDurationSec;
      if(opts.explanationLevel)parsedJson.explanationLevel=opts.explanationLevel;
      // Remove padding before both word-budget validation and the TTS measurement.
      if(Array.isArray(parsedJson.scenes)&&parsedJson.scenes.length&&parsedJson.scenes.every((s:any)=>typeof s.voiceText==='string'))cleanScriptNarration(parsedJson as Script);
      const structural=ScriptSchema.safeParse(parsedJson);
      const problems:string[]=structural.success?[]:[structural.error.message];
      if(opts.contentMode && Array.isArray(parsedJson.scenes) && parsedJson.scenes.length && parsedJson.scenes.every((s:any)=>typeof s.voiceText==='string')){
        try{validateNarration(parsedJson as Script,{measureHook:Boolean(opts.measureNarration)});}catch(err){problems.push((err as Error).message);}
        const duration=opts.targetDurationSec || (opts.contentMode==='deep-dive'?90:preset==='review_60'?60:45);
        const words=parsedJson.scenes.reduce((n:number,s:any)=>n+s.voiceText.trim().split(/\s+/).length,0);
        const minimum=Math.round((opts.explanationLevel?0:duration)*2.7);
        if(words<(opts.measureNarration?Math.round(minimum*.95):minimum))problems.push(`Lời đọc quá ngắn: ${words} tiếng; cần ít nhất ${minimum} tiếng cho mục tiêu ${duration}s. Bổ sung cách dùng, điều kiện, ví dụ thật từ nguồn; không lặp ý hoặc bịa để kéo dài.`);
        if(!opts.measureNarration && opts.directingMode && words>Math.round(duration*3.8))problems.push(`Lời đọc quá dài: ${words} tiếng cho ${duration}s. Giới hạn tối đa ${Math.round(duration*3.8)} tiếng, giữ ý quan trọng, chuyển ý phụ vào omittedTopics; không tăng số giây hoặc nói quá nhanh.`);
        if(!parsedJson.coverage)problems.push('Thiếu coverage sáu khía cạnh và đối chiếu nguồn.');
      }
      if(!opts.directingMode && preset==='review_60' && Array.isArray(parsedJson.scenes) && parsedJson.scenes.length<6)problems.push('REVIEW_60 cần 6–8 cảnh, gồm hook, các cảnh nội dung và outro.');
      if(!opts.directingMode && opts.contentMode==='deep-dive' && Array.isArray(parsedJson.scenes) && parsedJson.scenes.length<8)problems.push('Deep-dive cần 8–16 cảnh để giải thích đủ ý, không rút thành bản 5 cảnh.');
      if(problems.length)throw new Error(problems.join('\n'));
      if(!structural.success)throw structural.error;
      const validated=structural.data;
      prioritizePracticalExample(validated,sources.url);
      cleanScriptNarration(validated);
      if(verifiedStars)validated.metadata.githubStars=verifiedStars;
      applySpokenGithubHook(validated);
      if(opts.contentMode){reviewCoverage(validated,sources.content);validateCoverage(validated,sources.content);}
      reviewStoryboard(validated,sources.content);
      validatePracticalExamples(validated,sources.url);
      if(opts.measureNarration && opts.targetDurationSec){
        validated.voice={...validated.voice,...DEFAULT_VOICE,...opts.voice,pronunciationOverrides:mergePronunciationOverrides(validated.voice.pronunciationOverrides,opts.voice?.pronunciationOverrides)};
        validated.targetDurationSec=opts.targetDurationSec;
        validated.fitDuration=true;
        applyReferenceDefaults(validated,opts.creative);
        log.info(`Đang đo giọng đọc thật cho mục tiêu ${opts.targetDurationSec}s (lần ${attempt+1}/${MAX_RETRIES+1})...`);
        await writeFile(join(outDir,'draft-unmeasured.json'),JSON.stringify(validated,null,2));
        const measurement=await measureDraftAudio(validated,outDir,opts.measureNarration);
        const measured=assessNarration(validated,measurement);
        log.info(`Đã đo ${measured.speechSec.toFixed(1)}s lời đọc; hook ${measured.hookSec.toFixed(1)}s sau cân; tempo ${measured.tempo.toFixed(3)}x.`);
        await writeFile(join(outDir,'narration-timing.json'),JSON.stringify(measured,null,2));
        if(!measured.accepted){
          repairCandidate=validated;repairMeasurement=measurement;repairFeedback=measured.feedback;
          throw new Error(measured.feedback);
        }
        if(opts.explanationLevel)validated.targetDurationSec=measured.targetSec;
        validated.narrationTiming={targetSec:measured.targetSec,speechSec:measured.speechSec,tempo:measured.tempo,hookSec:measured.hookSec,attempts:attempt+1};
      }
      parsedScript = validated;
      break; // Success!
    } catch (err: unknown) {
      if(err instanceof NarrationAudioError)throw err;
      const errMsg = err instanceof Error ? err.message : String(err);
      log.warn(`  Attempt ${attempt + 1} failed: ${errMsg}`);
      if(repairCandidate)repairFeedback=errMsg;

      // Temporary provider outages must not consume the narration rewrite budget.
      if(opts.measureNarration && /(?:API error \((?:429|502|503|504)\)|timeout|ETIMEDOUT|ECONNRESET)/i.test(errMsg) && transientRetries<3){
        await new Promise(resolve=>setTimeout(resolve,1000*2**transientRetries++));
        attempt--;
        continue;
      }
      if (attempt < MAX_RETRIES) {
        currentPrompt = buildRetryPrompt(initialUserPrompt, lastRawResponse, errMsg);
      } else {
        throw new Error(
          `Failed to generate valid script after ${MAX_RETRIES + 1} attempts. Last error: ${errMsg}`,
        );
      }
    }
  }

  if (!parsedScript) {
    throw new Error("Unexpected error: script was not generated");
  }

  parsedScript.voice={...parsedScript.voice,...DEFAULT_VOICE,...opts.voice,pronunciationOverrides:mergePronunciationOverrides(parsedScript.voice.pronunciationOverrides,opts.voice?.pronunciationOverrides)};
  applyReferenceDefaults(parsedScript,opts.creative);

  // 4. Fact check numbers against source content
  log.info(`[3/4] Fact-checking numbers against source content...`);
  const factCheck = factCheckScript(parsedScript, sources.content);
  log.info(
    `  Fact check: ${factCheck.verifiedNumbers.length} verified, ${factCheck.flaggedNumbers.length} flagged out of ${factCheck.totalChecked} numbers.`,
  );

  // 5. Generate and write artifacts
  log.info(`[4/4] Writing script.json, sources.json, script.review.md to ${outDir}...`);
  const reviewMarkdown = buildReviewMarkdown(parsedScript, sources, preset, factCheck);

  await writeFile(join(outDir, "script.json"), JSON.stringify(parsedScript, null, 2), "utf8");
  await writeFile(join(outDir, "sources.json"), JSON.stringify(sources, null, 2), "utf8");
  await writeFile(join(outDir, "script.review.md"), reviewMarkdown, "utf8");

  log.info(`Script generation completed: ${outDir}`);

  return {
    script: parsedScript,
    sources,
    factCheck,
    reviewMarkdown,
    outputDir: outDir,
  };
}
