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
Bạn là Đạo diễn Hình ảnh & Chuyển động (AI Visual Director) cho video công nghệ ngắn 9:16 (TikTok/Reels/Shorts).
Nhiệm vụ: Bạn nhận được kịch bản lời đọc (Voice Script) và danh sách tài nguyên hình ảnh thực tế (ASSETS ĐANG CÓ). Bạn phải phân tích ngữ nghĩa từng câu để chọn bố cục thị giác và đồ họa minh chứng phù hợp nhất.

QUY TẮC BẮT BUỘC:
1. GIỮ NGUYÊN 100% LỜI ĐỌC (VOICE TEXT):
   - Tuyệt đối KHÔNG thay đổi, KHÔNG cắt xén, KHÔNG thêm bớt câu chữ trong lời đọc.
   - Khi nối trường "voiceText" của tất cả các cảnh theo thứ tự lại, phải khớp 100% kịch bản gốc.
   
2. CẤU TRÚC PHÂN CẢNH VÀ TRƯỜNG "type":
   - Cảnh 1 (đầu tiên): BẮT BUỘC "type": "hook"
   - Cảnh cuối cùng: BẮT BUỘC "type": "outro"
   - Tất cả các cảnh ở giữa: BẮT BUỘC "type": "body" (TUYỆT ĐỐI KHÔNG dùng type "intro", "feature", "code", "warning").

3. BẢNG TEMPLATE CHUẨN (CHỈ ĐƯỢC CHỌN TRONG CÁC TEMPLATE DƯỚI ĐÂY):
   * "hook" (Chỉ dùng cho cảnh 1):
     { "template": "hook", "headline": "TIÊU ĐỀ CHÍNH", "subhead": "Nguồn hoặc tóm tắt", "kenBurns": "zoom-in" }
   * "data-flow" (Kiến trúc, luồng dữ liệu, pipeline mô hình, ví dụ: Tokenizer -> Transformer -> Dự báo):
     { "template": "data-flow", "title": "KIẾN TRÚC HỆ THỐNG", "nodes": [{ "label": "BƯỚC 1", "detail": "Chi tiết ngắn" }, { "label": "BƯỚC 2", "detail": "Chi tiết ngắn" }], "caption": "Mô tả luồng" }
   * "worked-example" (Quy trình biến đổi cụ thể: Đầu vào -> Xử lý -> Đầu ra):
     { "template": "worked-example", "title": "CÁCH THỨC HOẠT ĐỘNG", "input": "Dữ liệu đầu vào", "operation": "Cách xử lý", "output": "Kết quả đầu ra", "basis": "source-example" }
   * "code-window" (Đoạn mã Python, lệnh CLI, fine-tune, tối đa 8 dòng code):
     { "template": "code-window", "title": "ĐOẠN MÃ THỰC THI", "language": "python", "code": "# mã nguồn ngắn gọn", "note": "Ghi chú ngắn" }
   * "comparison" (So sánh 2 phương án, 2 model, hoặc Thử nghiệm vs Giao dịch thực tế):
     { "template": "comparison", "left": { "label": "Thử Nghiệm", "value": "Độ chính xác cao", "color": "cyan" }, "right": { "label": "Thực Tế", "value": "Thị trường nhiễu", "color": "purple", "winner": false } }
   * "stat-hero" (Con số ấn tượng, số sàn giao dịch, số sao):
     { "template": "stat-hero", "value": "45+", "label": "SÀN GIAO DỊCH TOÀN CẦU", "context": "Dữ liệu huấn luyện" }
   * "workflow" (Quy trình 2-4 bước triển khai):
     { "template": "workflow", "title": "QUY TRÌNH DỰ BÁO", "steps": [{ "label": "Bước 1", "detail": "Mô tả" }, { "label": "Bước 2", "detail": "Mô tả" }] }
   * "feature-list" (Chỉ chứa KEYWORD hoặc TÍNH NĂNG CHÍNH, KHÔNG lặp nguyên văn câu nói):
     { "template": "feature-list", "title": "CÁC PHIÊN BẢN MODEL", "bullets": ["Phiên bản Mini", "Phiên bản Base", "Code fine-tune"] }
   * "callout" (Nhận định ngắn, cảnh báo rủi ro, điểm cốt lõi):
     { "template": "callout", "statement": "Nhận định ngắn gọn", "tag": "LƯU Ý RỦI RO" }
   * "phone-mockup" (Hiển thị screenshot demo, giao diện ứng dụng):
     { "template": "phone-mockup", "title": "GIAO DIỆN DEMO", "screenSrc": "previewUrl_của_asset", "caption": "Mô tả demo" }
   * "outro" (Chỉ dùng cho cảnh cuối):
     { "template": "outro", "ctaTop": "Khám phá repo ngay", "channelName": "DevPeek36", "source": "github.com" }

4. GÁN MEDIA THỰC TẾ (TẬN DỤNG ASSETS ĐANG CÓ):
   - Khi cảnh đề cập đến ảnh sơ đồ (overview), dự báo (prediction), hoặc kết quả backtest, HÃY gán vào trường "media":
     "media": {
       "type": "image",
       "src": "previewUrl_chính_xác_trong_danh_sách",
       "fit": "cover",
       "fx": "kenburns",
       "presentation": "card"
     }
   - KHÔNG dùng cùng 1 screenshot cho nhiều cảnh liên tiếp. Nếu không có ảnh thích hợp, dùng visual templates đồ họa (data-flow, code-window, worked-example, stat-hero).
   - "presentation" có thể là "card" (hiển thị khung cửa sổ browser mockup tinh tế) hoặc "background" (làm hình nền phóng to).

5. ĐỊNH DẠNG ĐẦU RA:
   Chỉ trả về JSON thuần túy:
   {
     "scenes": [
       { "id": "scene-1", "type": "hook", "voiceText": "...", "templateData": { ... }, "media": { ... } }
     ]
   }
`.trim();

/**
 * Repairs and normalizes an LLM visual plan so it conforms strictly to the Zod SceneSchema.
 */
export function repairAndNormalizeLlmPlan(
  rawScenes: any[],
  availableAssets: VisualAsset[],
  originalTranscript: string
): any[] {
  if (!Array.isArray(rawScenes)) return [];

  const assetByLabelOrKind = (hint: string): VisualAsset | undefined => {
    const lower = hint.toLowerCase();
    return (
      availableAssets.find((a) => a.id === hint) ||
      availableAssets.find((a) => a.previewUrl === hint) ||
      availableAssets.find((a) => a.label.toLowerCase().includes(lower)) ||
      availableAssets.find((a) => a.source.toLowerCase().includes(lower)) ||
      availableAssets.find((a) => a.kind.toLowerCase().includes(lower))
    );
  };

  const repaired = rawScenes.map((raw, idx) => {
    const s: any = { ...raw };
    s.id = `scene-${idx + 1}`;

    // 1. Normalize scene type
    if (idx === 0) {
      s.type = "hook";
    } else if (idx === rawScenes.length - 1) {
      s.type = "outro";
    } else {
      s.type = "body";
    }

    // 2. Normalize templateData
    let td = s.templateData ? { ...s.templateData } : {};
    let tName = typeof td.template === "string" ? td.template.toLowerCase() : "";

    // Normalize invalid template names
    if (tName === "browser" || tName === "image-highlight" || tName === "image") {
      const assetHint = td.screenshotId || td.imageId || td.imageSrc || td.src || "";
      const asset = assetHint ? assetByLabelOrKind(assetHint) : availableAssets.find((a) => a.kind === "readme-image" || a.kind === "screenshot");
      if (asset) {
        s.media = {
          type: "image",
          src: asset.previewUrl,
          fit: "cover",
          fx: "kenburns",
          presentation: "card",
        };
      }
      td = {
        template: "callout",
        statement: td.caption || td.title || s.voiceText.slice(0, 75),
        tag: "MINH HỌA",
      };
    } else if (tName === "code-file" || tName === "code") {
      td = {
        template: "code-window",
        title: td.title || td.filename || "MÃ NGUỒN THỰC THI",
        language: td.language || "python",
        code: typeof td.code === "string" ? td.code.split("\n").slice(0, 8).join("\n") : "# Mã nguồn kiểm thử",
        note: td.note || "Hỗ trợ tùy biến",
      };
    } else if (tName === "cta") {
      td = {
        template: "outro",
        ctaTop: td.title || td.action || "Khám phá repo ngay",
        channelName: "DevPeek36",
        source: td.repoName || "GitHub",
      };
    } else if (tName === "flow") {
      tName = "data-flow";
      td.template = "data-flow";
    }

    // Ensure templateData structure validity
    if (s.type === "hook") {
      td = {
        template: "hook",
        headline: td.headline || td.title || "CÔNG NGHỆ NỔI BẬT",
        subhead: td.subhead || td.subtitle || undefined,
        kenBurns: "zoom-in",
      };
    } else if (s.type === "outro") {
      td = {
        template: "outro",
        ctaTop: td.ctaTop || "Khám phá ngay",
        channelName: "DevPeek36",
        source: td.source || "GitHub",
      };
    } else {
      // Body templates
      if (td.template === "data-flow") {
        const nodes = Array.isArray(td.nodes) && td.nodes.length >= 2
          ? td.nodes.slice(0, 4).map((n: any, nIdx: number) => ({
              label: String(n.label || `BƯỚC ${nIdx + 1}`).slice(0, 24),
              detail: String(n.detail || "Xử lý dữ liệu").slice(0, 65),
            }))
          : [
              { label: "ĐẦU VÀO", detail: "Dữ liệu nến & token" },
              { label: "MÔ HÌNH", detail: "Transformer xử lý chuỗi" },
              { label: "KẾT QUẢ", detail: "Dự báo xu hướng" },
            ];
        td = {
          template: "data-flow",
          title: String(td.title || "KIẾN TRÚC MÔ HÌNH").slice(0, 40),
          nodes,
          caption: td.caption ? String(td.caption).slice(0, 90) : undefined,
        };
      } else if (td.template === "worked-example") {
        td = {
          template: "worked-example",
          title: String(td.title || "CÁCH THỨC HOẠT ĐỘNG").slice(0, 40),
          input: String(td.input || "Dữ liệu nến OHLCV").slice(0, 180),
          operation: String(td.operation || "Tokenizer xử lý").slice(0, 65),
          output: String(td.output || "Chuỗi token số hóa").slice(0, 180),
          basis: td.basis === "conceptual" ? "conceptual" : "source-example",
        };
      } else if (td.template === "code-window") {
        const rawCode = typeof td.code === "string" && td.code.trim() ? td.code.trim() : "# Khởi tạo pipeline dự báo\nmodel = KronosPipeline.from_pretrained('base')\nforecast = model.predict(candles)";
        const lines = rawCode.split("\n").slice(0, 8);
        td = {
          template: "code-window",
          title: String(td.title || "MÃ NGUỒN").slice(0, 40),
          language: String(td.language || "python").slice(0, 20),
          code: lines.join("\n"),
          note: td.note ? String(td.note).slice(0, 70) : undefined,
        };
      } else if (td.template === "comparison") {
        td = {
          template: "comparison",
          left: {
            label: String(td.left?.label || "Thử Nghiệm").slice(0, 30),
            value: String(td.left?.value || "Chính xác cao").slice(0, 30),
            color: "cyan",
          },
          right: {
            label: String(td.right?.label || "Thực Tế").slice(0, 30),
            value: String(td.right?.value || "Nhiễu thị trường").slice(0, 30),
            color: "purple",
            winner: Boolean(td.right?.winner),
          },
        };
      } else if (td.template === "stat-hero") {
        const numMatch = s.voiceText.match(/\b\d+([.,]\d+)?(%|x|k|M|GB|TB|sao|\+)?\b/i);
        td = {
          template: "stat-hero",
          value: String(td.value || (numMatch ? numMatch[0] : "45+")).slice(0, 20),
          label: String(td.label || "THÔNG SỐ NỔI BẬT").slice(0, 40),
          context: td.context ? String(td.context).slice(0, 40) : undefined,
        };
      } else if (td.template === "feature-list") {
        const rawBullets = Array.isArray(td.bullets) ? td.bullets : [s.voiceText];
        const bullets = rawBullets.slice(0, 3).map((b: any) => String(b).trim().slice(0, 48));
        td = {
          template: "feature-list",
          title: String(td.title || "TÍNH NĂNG CHÍNH").slice(0, 40),
          bullets: bullets.length >= 2 ? bullets : [...bullets, "Hỗ trợ mã nguồn mở"],
        };
      } else {
        // Fallback to callout
        td = {
          template: "callout",
          statement: String(td.statement || s.voiceText).slice(0, 78),
          tag: String(td.tag || "TIÊU ĐIỂM").slice(0, 20),
        };
      }
    }

    s.templateData = td;

    // Check media resolution
    if (s.media && typeof s.media === "object") {
      let resolvedSrc = s.media.src;
      const asset = assetByLabelOrKind(resolvedSrc);
      if (asset) resolvedSrc = asset.previewUrl;
      s.media = {
        type: s.media.type === "video" ? "video" : s.media.type === "screenshot" ? "screenshot" : "image",
        src: resolvedSrc,
        fit: s.media.fit === "contain" ? "contain" : "cover",
        fx: s.media.fx === "none" ? "none" : "kenburns",
        presentation: s.media.presentation || "card",
      };
    }

    return s;
  });

  return repaired;
}

/**
 * Validates that scenes form a coherent plan and strictly preserve the transcript.
 */
export function validateVisualPlan(scenes: any[], originalTranscript: string): SceneType[] {
  if (!Array.isArray(scenes) || scenes.length < 2) {
    throw new Error("Visual plan must contain at least 2 scenes (hook and outro).");
  }

  // 1. Validate each scene via Zod schema
  const parsedScenes = scenes.map((s, idx) => {
    if (!s.id || typeof s.id !== "string") {
      s.id = `scene-${idx + 1}`;
    }
    return Scene.parse(s);
  });

  // 2. Validate hook and outro positions
  if (parsedScenes[0].type !== "hook") {
    parsedScenes[0].type = "hook";
  }

  const lastIdx = parsedScenes.length - 1;
  if (parsedScenes[lastIdx].type !== "outro") {
    parsedScenes[lastIdx].type = "outro";
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
  if (Math.abs(tokensSpoken - tokensOriginal) > Math.max(6, tokensOriginal * 0.28)) {
    throw new Error(
      `AI Visual Planner đã thay đổi số lượng từ của kịch bản (${tokensSpoken} từ so với ${tokensOriginal} từ gốc). Kịch bản voice phải giữ nguyên để khớp audio.`
    );
  }

  return parsedScenes;
}

/**
 * High-Quality Deterministic Fallback Visual Planner.
 * Distributes ALL real available assets (screenshots, diagrams, prediction figures)
 * across scenes and applies semantic tech templates without mechanical text cards.
 */
export function deterministicVisualPlanner(
  transcript: string,
  source: SourceContent,
  assets: VisualAsset[],
  channelName = "DevPeek36"
): SceneType[] {
  log.info(`[Creative Planner] Generating high-quality semantic fallback visual plan...`);

  // Split transcript into sentences
  const rawSentences = transcript
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const sentences = rawSentences.length > 0 ? rawSentences : [transcript.trim()];

  // Decide scene count (4 to 8 scenes)
  const sceneCount = Math.max(4, Math.min(8, sentences.length));
  const chunkSize = Math.ceil(sentences.length / sceneCount);

  const sceneChunks: string[] = [];
  for (let i = 0; i < sentences.length; i += chunkSize) {
    sceneChunks.push(sentences.slice(i, i + chunkSize).join(" "));
  }

  // Ensure at least 4 scenes
  if (sceneChunks.length < 4) {
    while (sceneChunks.length < 4) {
      const longestIdx = sceneChunks.reduce((maxI, chunk, i) => (chunk.length > sceneChunks[maxI].length ? i : maxI), 0);
      const words = sceneChunks[longestIdx].split(" ");
      const mid = Math.floor(words.length / 2);
      sceneChunks.splice(longestIdx, 1, words.slice(0, mid).join(" "), words.slice(mid).join(" "));
    }
  }

  // Categorize assets
  const screenshot = assets.find((a) => a.kind === "screenshot");
  const readmeImages = assets.filter((a) => a.kind === "readme-image");
  const logo = assets.find((a) => a.kind === "repo-logo" || a.kind === "owner-avatar");
  const repoName = source.url.includes("github.com") ? source.url.split("/").pop()?.replace(/\.git$/, "") || source.title : source.title;

  const scenes: SceneType[] = [];

  // Scene 1: Hook
  scenes.push({
    id: "scene-1",
    type: "hook",
    voiceText: sceneChunks[0],
    templateData: {
      template: "hook",
      headline: repoName.toUpperCase().slice(0, 32),
      subhead: source.domain ? `Nguồn: ${source.domain}` : "MÃ NGUỒN MỞ",
      kenBurns: "zoom-in",
    },
    media: logo ? { type: "image", src: logo.previewUrl, fit: "contain", fx: "none", presentation: "logo" } : undefined,
  });

  // Body scenes: Rotate through semantic templates & assign real media assets
  let readmeImgIdx = 0;
  for (let i = 1; i < sceneChunks.length - 1; i++) {
    const text = sceneChunks[i];
    const sId = `scene-${i + 1}`;
    const numMatch = text.match(/\b\d+([.,]\d+)?(%|x|k|M|GB|TB|sao|\+)?\b/i);

    // Pick media for this scene if available
    let sceneMedia = undefined;
    if (i === 1 && screenshot) {
      sceneMedia = { type: "screenshot" as const, src: screenshot.previewUrl, fit: "cover" as const, fx: "kenburns" as const, presentation: "card" as const };
    } else if (readmeImages.length > 0 && readmeImgIdx < readmeImages.length) {
      const img = readmeImages[readmeImgIdx++];
      sceneMedia = { type: "image" as const, src: img.previewUrl, fit: "cover" as const, fx: "kenburns" as const, presentation: "card" as const };
    }

    // Choose semantic template based on content keywords
    if (numMatch && (text.includes("sàn") || text.includes("dữ liệu") || text.includes("triệu") || text.includes("nghìn"))) {
      scenes.push({
        id: sId,
        type: "body",
        voiceText: text,
        templateData: {
          template: "stat-hero",
          value: numMatch[0],
          label: "DỮ LIỆU HUẤN LUYỆN TOÀN CẦU",
          context: source.domain || "Thị trường tài chính",
        },
        media: sceneMedia,
      });
    } else if (text.toLowerCase().includes("token") || text.toLowerCase().includes("chuyển") || text.toLowerCase().includes("nến")) {
      scenes.push({
        id: sId,
        type: "body",
        voiceText: text,
        templateData: {
          template: "worked-example",
          title: "BỘ TOKENIZER TÀI CHÍNH",
          input: "Dữ liệu nến OHLCV (Mở/Đóng/Cao/Thấp)",
          operation: "Mã hóa nến thành chuỗi token",
          output: "Chuỗi token cho Transformer",
          basis: "source-example",
        },
        media: sceneMedia,
      });
    } else if (text.toLowerCase().includes("transformer") || text.toLowerCase().includes("dự báo") || text.toLowerCase().includes("mô hình")) {
      scenes.push({
        id: sId,
        type: "body",
        voiceText: text,
        templateData: {
          template: "data-flow",
          title: "LUỒNG DỰ BÁO TRANSFORMER",
          nodes: [
            { label: "Token Input", detail: "Nhận chuỗi token nến" },
            { label: "Transformer", detail: "Phân tích diễn biến chuỗi" },
            { label: "Forecast 24h", detail: "Dự báo giá tiếp theo" },
          ],
          caption: "Mô hình học chuỗi thời gian",
        },
        media: sceneMedia,
      });
    } else if (text.toLowerCase().includes("code") || text.toLowerCase().includes("python") || text.toLowerCase().includes("fine-tune")) {
      scenes.push({
        id: sId,
        type: "body",
        voiceText: text,
        templateData: {
          template: "code-window",
          title: "CODE PYTHON DỰ BÁO",
          language: "python",
          code: "from kronos import KronosModel\n\nmodel = KronosModel.from_pretrained('base')\nforecast = model.predict(btc_usdt_candles)",
          note: "Hỗ trợ nhiều kích thước model",
        },
        media: sceneMedia,
      });
    } else if (text.toLowerCase().includes("rủi ro") || text.toLowerCase().includes("nhiễu") || text.toLowerCase().includes("thất bại") || text.toLowerCase().includes("kiếm tiền")) {
      scenes.push({
        id: sId,
        type: "body",
        voiceText: text,
        templateData: {
          template: "comparison",
          left: { label: "Thử Nghiệm", value: "Dự đoán khả quan", color: "cyan" },
          right: { label: "Thực Tế", value: "Thị trường nhiễu cao", color: "purple", winner: false },
        },
        media: sceneMedia,
      });
    } else {
      const phrases = text.split(/[,;–—]\s+/).map((p) => p.trim()).filter((p) => p.length >= 3);
      const bullets = phrases.length >= 2 ? phrases.slice(0, 3).map((p) => p.slice(0, 48)) : [text.slice(0, 48), "Mã nguồn mở"];
      scenes.push({
        id: sId,
        type: "body",
        voiceText: text,
        templateData: {
          template: "feature-list",
          title: "ĐẶC ĐIỂM NỔI BẬT",
          bullets,
        },
        media: sceneMedia,
      });
    }
  }

  // Scene Last: Outro
  scenes.push({
    id: `scene-${sceneChunks.length}`,
    type: "outro",
    voiceText: sceneChunks[sceneChunks.length - 1],
    templateData: {
      template: "outro",
      ctaTop: "Khám phá repo ngay",
      channelName: channelName || "DevPeek36",
      source: source.domain || "github.com",
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

      const assetDescriptions = availableAssets
        .map((a) => `- [${a.kind}] id: "${a.id}", label: "${a.label}", url: "${a.previewUrl}"`)
        .join("\n");

      const userPrompt = `
NỘI DUNG KỊCH BẢN CHỮ (DO CHATGPT VIẾT):
"""
${transcript.trim()}
"""

THÔNG TIN NGUỒN CÔNG KHAI:
- URL: ${url}
- Tiêu đề: ${source.title}
- Domain: ${source.domain}
- Trích đoạn tóm tắt: ${source.content.slice(0, 3500)}

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
      const repairedScenes = repairAndNormalizeLlmPlan(candidateScenes, availableAssets, transcript);
      return validateVisualPlan(repairedScenes, transcript);
    } catch (err: any) {
      log.warn(`[Creative Planner] LLM visual planning failed: ${err.message}. Falling back to deterministic plan.`);
    }
  }

  // Fallback to high-quality deterministic plan
  return deterministicVisualPlanner(transcript, source, availableAssets, channelName);
}
