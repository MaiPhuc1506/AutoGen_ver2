import { z } from "zod";
import type { LLMProvider } from "../script/types.js";
import type { SourceContent } from "../script/types.js";
import { Scene, type SceneType } from "../render/script-schema.js";
import { cleanLlmJson } from "../script/generator.js";
import { normalizeText } from "../captions/audio-aligner.js";
import { log } from "../utils/logger.js";
import type { VisualAsset } from "./visuals.js";

export interface CreativePlannerParams {
  transcript: string;
  url: string;
  source: SourceContent;
  availableAssets: VisualAsset[];
  llmProvider?: LLMProvider | null;
  channelName?: string;
}

const CREATIVE_PLANNER_SYSTEM_PROMPT = `
Bạn là Đạo diễn Hình ảnh (AI Visual Planner) cho video ngắn 9:16 chất lượng cao.
Nhiệm vụ: Bạn nhận được kịch bản lời đọc (Voice Script) do người dùng cung cấp và thông tin bài viết/repo thật. Bạn phải phân tích ngữ nghĩa từng đoạn và phân bổ các cảnh thị giác (Visual Scenes) tương ứng.

QUY TẮC BẮT BUỘC (TUÂN THỦ 100%):
1. GIỮ NGUYÊN LỜI ĐỌC (VOICE TEXT):
   - Tuyệt đối KHÔNG viết lại, KHÔNG thêm bớt, KHÔNG sửa đổi câu chữ trong lời đọc.
   - Phải chia toàn bộ transcript thành các scene tuần tự. Khi ghép voiceText của tất cả các scene lại phải đúng 100% nội dung kịch bản gốc.
   
2. CẤU TRÚC PHÂN CẢNH:
   - Cảnh đầu tiên (index 0): BẮT BUỘC là "hook" (type: "hook", template: "hook").
     * Tự do chọn cách mở đầu phù hợp: typography nổi bật, screenshot repo, logo tác giả, hoặc hoạt họa nảy số dựa trên nội dung câu mở đầu.
   - Cảnh cuối cùng: BẮT BUỘC là "outro" (type: "outro", template: "outro").
   - Các cảnh ở giữa (type: "body"): Chọn template thể hiện tốt nhất ý nghĩa:
     * "stat-hero": Khi đoạn nói về con số ấn tượng, phần trăm, số sao, dung lượng.
     * "feature-list": Khi đoạn liệt kê 2-4 tính năng hoặc ưu điểm.
     * "worked-example": Khi đoạn giải thích ví dụ thực hành, tình huống cụ thể hoặc luồng input -> output.
     * "data-flow": Khi đoạn mô tả kiến trúc hệ thống hoặc luồng dữ liệu 2-4 bước.
     * "callout": Khi đoạn là một tuyên ngôn quan trọng, nhận định, trích dẫn.
     * "workflow": Khi đoạn mô tả quy trình thực tế các bước.
     * "code-window": Khi đoạn nhắc đến câu lệnh terminal hoặc đoạn mã có trong nguồn.
     * "comparison": Khi đoạn so sánh hai giải pháp, trước và sau.

3. HẠN CHẾ LẶP BỐ CỤC:
   - Ưu tiên diễn giải đúng nội dung kịch bản.
   - Hạn chế lặp lại cùng một bố cục thị giác hoặc template liên tiếp nhau (ví dụ: không xếp 3 cảnh feature-list cạnh nhau nếu có thể xen kẽ bằng callout hoặc worked-example).

4. TRUNG THỰC VÀ BẢO ĐẢM TÀI NGUYÊN THẬT:
   - KHÔNG bịa đặt số liệu thống kê hoặc tính năng không có trong nguồn.
   - Chỉ sử dụng media thật từ danh sách ASSETS ĐANG CÓ. Nếu cảnh dùng screenshot hoặc logo, gán media tương ứng.

5. ĐỊNH DẠNG ĐẦU RA:
   - Chỉ trả về đúng 1 chuỗi JSON hợp lệ: { "scenes": [ ... ] }.
   - KHÔNG bọc trong markdown code fence, không có lời dẫn nào khác.
`.trim();

/**
 * Validates that scenes form a coherent plan and strictly preserve the transcript.
 */
export function validateVisualPlan(scenes: any[], originalTranscript: string): SceneType[] {
  if (!Array.isArray(scenes) || scenes.length < 2) {
    throw new Error("Visual plan must contain at least 2 scenes (hook and outro).");
  }

  // 1. Validate each scene via Zod schema
  const parsedScenes = scenes.map((s, idx) => {
    // Ensure proper ID format
    if (!s.id || typeof s.id !== "string") {
      s.id = `scene-${idx + 1}`;
    }
    return Scene.parse(s);
  });

  // 2. Validate hook and outro positions
  if (parsedScenes[0].type !== "hook") {
    parsedScenes[0].type = "hook";
    const rawTd = parsedScenes[0].templateData as any;
    parsedScenes[0].templateData = {
      template: "hook",
      headline: rawTd?.headline || "ĐIỂM NHẤN CÔNG NGHỆ",
      subhead: rawTd?.subhead,
      kenBurns: "zoom-in",
    };
  }

  const lastIdx = parsedScenes.length - 1;
  if (parsedScenes[lastIdx].type !== "outro") {
    parsedScenes[lastIdx].type = "outro";
    parsedScenes[lastIdx].templateData = {
      template: "outro",
      ctaTop: "Khám phá ngay",
      channelName: "DevPeek36",
      source: "GitHub",
    };
  }

  // 3. Verify total voice text coverage
  const combinedSpoken = parsedScenes.map((s) => s.voiceText).join(" ");
  const normSpoken = normalizeText(combinedSpoken);
  const normOriginal = normalizeText(originalTranscript);

  if (normSpoken.length === 0 || normOriginal.length === 0) {
    throw new Error("Kịch bản lời đọc không được rỗng.");
  }

  // If token counts differ drastically (> 30%), the LLM likely rewrote the text
  const tokensSpoken = normSpoken.split(/\s+/).length;
  const tokensOriginal = normOriginal.split(/\s+/).length;
  if (Math.abs(tokensSpoken - tokensOriginal) > Math.max(5, tokensOriginal * 0.25)) {
    throw new Error(
      `AI Visual Planner đã thay đổi số lượng từ của kịch bản (${tokensSpoken} từ so với ${tokensOriginal} từ gốc). Kịch bản voice phải giữ nguyên để khớp audio.`
    );
  }

  return parsedScenes;
}

/**
 * Deterministic Fallback Visual Planner.
 * Used if LLM is unavailable or returns an invalid visual plan.
 * Slices transcript cleanly, applies varied templates, attaches real assets without hallucination.
 */
export function deterministicVisualPlanner(
  transcript: string,
  source: SourceContent,
  assets: VisualAsset[],
  channelName = "DevPeek36"
): SceneType[] {
  log.info(`[Creative Planner] Generating deterministic fallback visual plan...`);

  // Split transcript into sentences
  const rawSentences = transcript
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const sentences = rawSentences.length > 0 ? rawSentences : [transcript.trim()];

  // Decide scene count (3 to 8 scenes)
  const sceneCount = Math.max(3, Math.min(8, sentences.length));
  const chunkSize = Math.ceil(sentences.length / sceneCount);

  const sceneChunks: string[] = [];
  for (let i = 0; i < sentences.length; i += chunkSize) {
    sceneChunks.push(sentences.slice(i, i + chunkSize).join(" "));
  }

  // Ensure last chunk is outro
  if (sceneChunks.length < 3) {
    while (sceneChunks.length < 3) {
      const longestIdx = sceneChunks.reduce((maxI, chunk, i) => (chunk.length > sceneChunks[maxI].length ? i : maxI), 0);
      const words = sceneChunks[longestIdx].split(" ");
      const mid = Math.floor(words.length / 2);
      sceneChunks.splice(longestIdx, 1, words.slice(0, mid).join(" "), words.slice(mid).join(" "));
    }
  }

  const screenshotAsset = assets.find((a) => a.kind === "screenshot");
  const logoAsset = assets.find((a) => a.kind === "repo-logo" || a.kind === "owner-avatar");
  const repoName = source.url.includes("github.com") ? source.url.split("/").pop()?.replace(/\.git$/, "") || source.title : source.title;

  const scenes: SceneType[] = [];

  // Scene 1: Hook
  scenes.push({
    id: "scene-1",
    type: "hook",
    voiceText: sceneChunks[0],
    templateData: {
      template: "hook",
      headline: repoName.toUpperCase().slice(0, 36),
      subhead: source.domain ? `Nguồn: ${source.domain}` : undefined,
      kenBurns: "zoom-in",
    },
    media: screenshotAsset
      ? { type: "screenshot", src: screenshotAsset.previewUrl, fit: "cover", fx: "kenburns" }
      : undefined,
  });

  // Body scenes: rotate templates intelligently without rigid repetition
  const bodyTemplates: Array<"feature-list" | "stat-hero" | "callout" | "worked-example"> = [
    "feature-list",
    "callout",
    "stat-hero",
    "worked-example",
  ];

  for (let i = 1; i < sceneChunks.length - 1; i++) {
    const text = sceneChunks[i];
    const sId = `scene-${i + 1}`;
    const tIndex = (i - 1) % bodyTemplates.length;
    const chosenTemplate = bodyTemplates[tIndex];

    const numMatch = text.match(/\b\d+([.,]\d+)?(%|x|k|M|GB|TB|sao)?\b/i);

    if (chosenTemplate === "stat-hero" && numMatch) {
      scenes.push({
        id: sId,
        type: "body",
        voiceText: text,
        templateData: {
          template: "stat-hero",
          value: numMatch[0],
          label: "ĐIỂM NỔI BẬT TỪ NGUỒN",
          context: source.domain || "Công nghệ",
        },
      });
    } else if (chosenTemplate === "feature-list") {
      const phrases = text.split(/[,;–—]\s+/).map((p) => p.trim()).filter((p) => p.length >= 3);
      const bullets = phrases.length >= 2 ? phrases.slice(0, 3).map((p) => p.slice(0, 48)) : [text.slice(0, 48)];
      scenes.push({
        id: sId,
        type: "body",
        voiceText: text,
        templateData: {
          template: "feature-list",
          title: "TÍNH NĂNG CHÍNH",
          bullets,
        },
        media: i === 1 && screenshotAsset ? { type: "screenshot", src: screenshotAsset.previewUrl, fit: "cover", fx: "kenburns" } : undefined,
      });
    } else if (chosenTemplate === "worked-example") {
      scenes.push({
        id: sId,
        type: "body",
        voiceText: text,
        templateData: {
          template: "worked-example",
          title: "CÁCH THỨC HOẠT ĐỘNG",
          input: "Yêu cầu / Đầu vào nguồn",
          operation: "Xử lý tự động theo repo",
          output: "Kết quả hoàn thành",
          basis: "source-example",
        },
      });
    } else {
      scenes.push({
        id: sId,
        type: "body",
        voiceText: text,
        templateData: {
          template: "callout",
          statement: text.slice(0, 78),
          tag: "TIÊU ĐIỂM",
        },
      });
    }
  }

  // Last Scene: Outro
  scenes.push({
    id: `scene-${sceneChunks.length}`,
    type: "outro",
    voiceText: sceneChunks[sceneChunks.length - 1],
    templateData: {
      template: "outro",
      ctaTop: "Theo dõi cập nhật",
      channelName: channelName || "DevPeek36",
      source: source.domain || "Nguồn tin",
    },
  });

  return scenes;
}

/**
 * Main AI Visual Planner entrypoint for Creative Mode.
 */
export async function planCreativeVisuals(params: CreativePlannerParams): Promise<SceneType[]> {
  const { transcript, url, source, availableAssets, llmProvider, channelName } = params;

  if (llmProvider) {
    try {
      log.info(`[Creative Planner] Planning visuals using configured LLM (${llmProvider.name})...`);

      const assetDescriptions = availableAssets.map((a) => `- [${a.kind}] id: ${a.id}, label: "${a.label}", source: "${a.source}"`).join("\n");

      const userPrompt = `
NỘI DUNG KỊCH BẢN CHỮ (DO CHATGPT VIẾT):
"""
${transcript.trim()}
"""

THÔNG TIN NGUỒN CÔNG KHAI:
- URL: ${url}
- Tiêu đề: ${source.title}
- Domain: ${source.domain}
- Trích đoạn tóm tắt: ${source.content.slice(0, 4000)}

DANH SÁCH ASSETS THẬT ĐANG CÓ TRÊN ĐĨA:
${assetDescriptions || "(Chưa có screenshot hay logo tải sẵn; chỉ dùng template chữ và bố cục đồ họa)"}

YÊU CẦU:
Hãy phân tích ngữ nghĩa kịch bản trên và trả về đúng 1 object JSON có dạng: { "scenes": [ ... ] }.
Đảm bảo giữ nguyên vẹn 100% câu chữ của kịch bản giọng đọc, không lặp template liên tiếp một cách máy móc, và gán media thật phù hợp.
`.trim();

      const rawLlmResponse = await llmProvider.generate(CREATIVE_PLANNER_SYSTEM_PROMPT, userPrompt);
      const cleanedJson = cleanLlmJson(rawLlmResponse);
      const parsed = JSON.parse(cleanedJson);

      const candidateScenes = parsed.scenes || parsed;
      return validateVisualPlan(candidateScenes, transcript);
    } catch (err: any) {
      log.warn(`[Creative Planner] LLM visual planning failed: ${err.message}. Falling back to deterministic plan.`);
    }
  }

  // Fallback to deterministic plan
  return deterministicVisualPlanner(transcript, source, availableAssets, channelName);
}
