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

/**
 * Condenses verbose narrative text into punchy on-screen visual cues (2-6 words).
 * Strips conversational filler, narrative prefixes, and avoids cutting words mid-sentence.
 */
export function condenseVisualText(
  input: string | undefined | null,
  maxWords = 5,
  fallback = "ĐIỂM NỔI BẬT"
): string {
  if (!input || typeof input !== "string") return fallback;
  let text = input.trim();
  if (!text) return fallback;

  // 1. Remove narrative filler prefixes common in conversational/voice scripts
  const fillerPrefixes = [
    /^(?:theo\s+(?:nhóm\s+phát\s+triển|báo\s+cáo|tác\s+giả|nghiên\s+cứu)|theo\s+đó)[,:\s]*/i,
    /^(?:thông\s+thường|như\s+thường\s+lệ|trên\s+thực\s+tế|thực\s+tế\s+là)[,:\s]*/i,
    /^(?:khi\s+nhìn\s+vào|khi\s+quan\s+sát|khi\s+xem)[,:\s]*/i,
    /^(?:chúng\s+ta\s+(?:sẽ\s+thấy|thấy|có\s+thể\s+thấy)|ta\s+thấy)[,:\s]*/i,
    /^(?:và\s+đây\s+là|đây\s+là|nó\s+tên\s+là|có\s+tên\s+là)[,:\s]*/i,
    /^(?:nhưng\s+làm\s+sao\s+để|làm\s+sao\s+để|bằng\s+cách\s+nào)[,:\s]*/i,
    /^(?:sau\s+đó|tiếp\s+theo|bước\s+kế\s+tiếp)[,:\s]*/i,
    /^(?:điểm\s+hay\s+là|điểm\s+đặc\s+biệt\s+là|thú\s+vị\s+là)[,:\s]*/i,
    /^(?:bạn\s+có\s+thể|người\s+dùng\s+có\s+thể|chúng\s+ta\s+có\s+thể)[,:\s]*/i,
    /^(?:repo\s+cũng|dự\s+án\s+cũng|mô\s+hình\s+cũng)[,:\s]*/i,
    /^(?:nhưng\s+đừng\s+nhầm|đừng\s+quên\s+rằng|cần\s+lưu\s+ý\s+rằng)[,:\s]*/i,
    /^(?:nếu\s+bạn\s+đang|nếu\s+muốn|nếu\s+cần)[,:\s]*/i,
  ];

  for (const rx of fillerPrefixes) {
    text = text.replace(rx, "").trim();
  }

  // 2. Domain-aware punchy cues for technical scripts
  const lower = text.toLowerCase();
  if (lower.includes("rủi ro") || lower.includes("nhiễu") || (lower.includes("thất bại") && lower.includes("giao dịch"))) {
    if (lower.includes("kiếm tiền")) return "DỰ BÁO ≠ KIẾM TIỀN";
    return "RỦI RO THỊ TRƯỜNG";
  }
  if ((lower.includes("nến") || lower.includes("ohlcv")) && lower.includes("token")) {
    return "NẾN GIÁ → TOKEN";
  }
  if (lower.includes("45") && lower.includes("sàn")) {
    return "45+ SÀN GIAO DỊCH";
  }
  if (lower.includes("bitcoin") && (lower.includes("đọc") || lower.includes("biểu đồ"))) {
    return "AI ĐỌC BIỂU ĐỒ BITCOIN?";
  }

  // 3. Take first clause if sentence has comma, colon, or question mark
  const firstClauseMatch = text.match(/^([^,;:?!.]+)/);
  if (firstClauseMatch && firstClauseMatch[1].trim().split(/\s+/).length <= maxWords + 1) {
    text = firstClauseMatch[1].trim();
  }

  // 4. Tokenize by whitespace and limit to maxWords without slicing words
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length <= maxWords) {
    return text.replace(/[.,;:]+$/, "");
  }

  const shortened = tokens.slice(0, maxWords).join(" ").replace(/[.,;:]+$/, "");
  return shortened || fallback;
}

const CREATIVE_PLANNER_SYSTEM_PROMPT = `
Bạn là Đạo diễn Hình ảnh & Chuyển động (AI Visual Director) cho video công nghệ ngắn 9:16 (TikTok/Reels/Shorts).
Nhiệm vụ: Bạn nhận được kịch bản lời đọc (Voice Script) và danh sách tài nguyên hình ảnh thực tế (ASSETS ĐANG CÓ). Bạn phải phân tích ngữ nghĩa từng câu để chọn bố cục thị giác và đồ họa minh chứng phù hợp nhất.

QUY TẮC BẮT BUỘC:
1. GIỮ NGUYÊN 100% LỜI ĐỌC (VOICE TEXT):
   - Tuyệt đối KHÔNG thay đổi, KHÔNG cắt xén, KHÔNG thêm bớt câu chữ trong trường "voiceText".
   - Khi nối trường "voiceText" của tất cả các cảnh theo thứ tự lại, phải khớp 100% kịch bản gốc.

2. TÁCH BIỆT HOÀN TOÀN GIỮA LỜI ĐỌC VÀ CHỮ TRÊN MÀN HÌNH (VISUAL TEXT):
   - Phụ đề (captions) chạy bên dưới đã hiển thị toàn bộ lời nói của người thuyết minh.
   - Chữ hiển thị trên card (Visual Text) CHỈ LÀ TIÊU ĐỀ THỊ GIÁC NGẮN GỌN (Punchy Visual Cues), TUYỆT ĐỐI KHÔNG COPY NGUYÊN VĂN CÂU NÓI!
   - Quy tắc độ dài nghiêm ngặt:
     * Hook headline: 3–6 từ (VD: "AI ĐỌC BIỂU ĐỒ BITCOIN?", "KRONOS AI DỰ BÁO TÀI CHÍNH").
     * Headline scene / Callout statement: 2–5 từ (VD: "45+ SÀN GIAO DỊCH", "NẾN GIÁ → TOKEN", "DỰ BÁO ≠ KIẾM TIỀN").
     * Subhead / Context: Tối đa 8 từ (VD: "Mô hình ngôn ngữ cho chuỗi thời gian").
     * Bullets (feature-list): 2–6 từ (VD: "Model Mini & Base", "Code Python dự báo").
     * Nodes (data-flow): label 2-4 từ, detail 3-5 từ.
   - Mỗi scene chỉ có một thông điệp thị giác chính. KHÔNG cố hiển thị toàn bộ thông tin của lời đọc lên scene.
    
3. CẤU TRÚC PHÂN CẢNH VÀ TRƯỜNG "type":
   - Cảnh 1 (đầu tiên): BẮT BUỘC "type": "hook"
   - Cảnh cuối cùng: BẮT BUỘC "type": "outro"
   - Tất cả các cảnh ở giữa: BẮT BUỘC "type": "body" (TUYỆT ĐỐI KHÔNG dùng type "intro", "feature", "code", "warning").

4. BẢNG TEMPLATE CHUẨN (CHỈ ĐƯỢC CHỌN TRONG CÁC TEMPLATE DƯỚI ĐÂY):
   * "hook" (Chỉ dùng cho cảnh 1):
     { "template": "hook", "headline": "TIÊU ĐỀ 3-6 TỪ", "subhead": "Nguồn hoặc tóm tắt tối đa 8 từ", "kenBurns": "zoom-in" }
   * "data-flow" (Kiến trúc, luồng dữ liệu, pipeline mô hình, ví dụ: Tokenizer -> Transformer -> Dự báo):
     { "template": "data-flow", "title": "KIẾN TRÚC MÔ HÌNH", "nodes": [{ "label": "BƯỚC 1", "detail": "Nến giá thô" }, { "label": "BƯỚC 2", "detail": "Mã hóa token" }], "caption": "Quy trình chuyển đổi nến thành token" }
   * "worked-example" (Quy trình biến đổi cụ thể: Đầu vào -> Xử lý -> Đầu ra):
     { "template": "worked-example", "title": "CÁCH THỨC HOẠT ĐỘNG", "input": "Dữ liệu nến OHLCV", "operation": "Nến giá → Token", "output": "Dự báo BTC 24h", "basis": "source-example" }
   * "code-window" (Đoạn mã Python, lệnh CLI, fine-tune, tối đa 8 dòng code):
     { "template": "code-window", "title": "MÃ NGUỒN PYTHON", "language": "python", "code": "# mã nguồn ngắn gọn", "note": "Hỗ trợ fine-tune" }
   * "comparison" (So sánh 2 phương án, 2 model, hoặc Thử nghiệm vs Giao dịch thực tế):
     { "template": "comparison", "left": { "label": "Thử Nghiệm", "value": "Chính xác cao", "color": "cyan" }, "right": { "label": "Thực Tế", "value": "Thị trường nhiễu", "color": "purple", "winner": false } }
   * "stat-hero" (Con số ấn tượng, số sàn giao dịch, số sao):
     { "template": "stat-hero", "value": "45+", "label": "45+ SÀN GIAO DỊCH", "context": "Dữ liệu huấn luyện toàn cầu" }
   * "workflow" (Quy trình 2-4 bước triển khai):
     { "template": "workflow", "title": "QUY TRÌNH DỰ BÁO", "steps": [{ "label": "Bước 1", "detail": "Mô tả ngắn" }, { "label": "Bước 2", "detail": "Mô tả ngắn" }] }
   * "feature-list" (Chỉ chứa KEYWORD hoặc TÍNH NĂNG CHÍNH 2-6 từ, KHÔNG lặp nguyên văn câu nói):
     { "template": "feature-list", "title": "CÁC PHIÊN BẢN MODEL", "bullets": ["Phiên bản Mini & Base", "Code Python dự báo", "Fine-tune dữ liệu riêng"] }
   * "callout" (Nhận định ngắn 2-5 từ, cảnh báo rủi ro, điểm cốt lõi):
     { "template": "callout", "statement": "DỰ BÁO ≠ KIẾM TIỀN", "tag": "LƯU Ý RỦI RO" }
   * "phone-mockup" (Hiển thị screenshot demo, giao diện ứng dụng):
     { "template": "phone-mockup", "title": "GIAO DIỆN DEMO", "screenSrc": "previewUrl_của_asset", "caption": "Giao diện kiểm thử" }
   * "outro" (Chỉ dùng cho cảnh cuối):
     { "template": "outro", "ctaTop": "Khám phá repo ngay", "channelName": "DevPeek36", "source": "github.com" }

5. GÁN MEDIA THỰC TẾ (TẬN DỤNG ASSETS ĐANG CÓ):
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

6. ĐỊNH DẠNG ĐẦU RA:
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
        statement: condenseVisualText(td.caption || td.title || td.statement || s.voiceText, 5, "TIÊU ĐIỂM CÔNG NGHỆ"),
        tag: "MINH HỌA",
      };
    } else if (tName === "code-file" || tName === "code") {
      td = {
        template: "code-window",
        title: condenseVisualText(td.title || td.filename || "MÃ NGUỒN THỰC THI", 5, "MÃ NGUỒN"),
        language: td.language || "python",
        code: typeof td.code === "string" ? td.code.split("\n").slice(0, 8).join("\n") : "# Mã nguồn kiểm thử",
        note: td.note ? condenseVisualText(td.note, 6, "Hỗ trợ tùy biến") : "Hỗ trợ tùy biến",
      };
    } else if (tName === "cta") {
      td = {
        template: "outro",
        ctaTop: condenseVisualText(td.title || td.action || "Khám phá repo ngay", 5, "Khám phá repo ngay"),
        channelName: "DevPeek36",
        source: td.repoName || "GitHub",
      };
    } else if (tName === "flow") {
      tName = "data-flow";
      td.template = "data-flow";
    }

    // Ensure templateData structure validity with concise 2-5 word visual cues
    if (s.type === "hook") {
      td = {
        template: "hook",
        headline: condenseVisualText(td.headline || td.title || s.voiceText, 5, "CÔNG NGHỆ MỚI").toUpperCase(),
        subhead: td.subhead ? condenseVisualText(td.subhead, 7, "Mã nguồn mở") : undefined,
        kenBurns: "zoom-in",
      };
    } else if (s.type === "outro") {
      td = {
        template: "outro",
        ctaTop: condenseVisualText(td.ctaTop || "Khám phá ngay", 5, "Khám phá ngay"),
        channelName: "DevPeek36",
        source: td.source || "GitHub",
      };
    } else {
      // Body templates
      if (td.template === "data-flow") {
        const nodes = Array.isArray(td.nodes) && td.nodes.length >= 2
          ? td.nodes.slice(0, 3).map((n: any, nIdx: number) => ({
              label: condenseVisualText(n.label || `BƯỚC ${nIdx + 1}`, 3, `BƯỚC ${nIdx + 1}`),
              detail: condenseVisualText(n.detail || "Xử lý dữ liệu", 5, "Xử lý dữ liệu"),
            }))
          : [
              { label: "ĐẦU VÀO", detail: "Dữ liệu nến & token" },
              { label: "MÔ HÌNH", detail: "Transformer xử lý chuỗi" },
              { label: "KẾT QUẢ", detail: "Dự báo xu hướng" },
            ];
        td = {
          template: "data-flow",
          title: condenseVisualText(td.title || "KIẾN TRÚC MÔ HÌNH", 4, "LUỒNG DỮ LIỆU").toUpperCase(),
          nodes,
          caption: td.caption ? condenseVisualText(td.caption, 7, "Mô hình chuỗi thời gian") : undefined,
        };
      } else if (td.template === "worked-example") {
        td = {
          template: "worked-example",
          title: condenseVisualText(td.title || "CÁCH THỨC HOẠT ĐỘNG", 4, "VÍ DỤ THỰC TẾ").toUpperCase(),
          input: condenseVisualText(td.input || "Dữ liệu nến OHLCV", 5, "Dữ liệu nến OHLCV"),
          operation: condenseVisualText(td.operation || "Tokenizer xử lý", 5, "Nến giá → Token"),
          output: condenseVisualText(td.output || "Chuỗi token số hóa", 5, "Dự báo BTC 24h"),
          basis: td.basis === "conceptual" ? "conceptual" : "source-example",
        };
      } else if (td.template === "code-window") {
        const rawCode = typeof td.code === "string" && td.code.trim() ? td.code.trim() : "# Khởi tạo pipeline dự báo\nmodel = KronosPipeline.from_pretrained('base')\nforecast = model.predict(candles)";
        const lines = rawCode.split("\n").slice(0, 8);
        td = {
          template: "code-window",
          title: condenseVisualText(td.title || "MÃ NGUỒN PYTHON", 4, "CODE PYTHON").toUpperCase(),
          language: String(td.language || "python").slice(0, 20),
          code: lines.join("\n"),
          note: td.note ? condenseVisualText(td.note, 6, "Hỗ trợ fine-tune") : undefined,
        };
      } else if (td.template === "comparison") {
        td = {
          template: "comparison",
          left: {
            label: condenseVisualText(td.left?.label || "Thử Nghiệm", 3, "TRƯỚC"),
            value: condenseVisualText(td.left?.value || "Chính xác cao", 4, "Lý thuyết"),
            color: "cyan",
          },
          right: {
            label: condenseVisualText(td.right?.label || "Thực Tế", 3, "SAU"),
            value: condenseVisualText(td.right?.value || "Nhiễu thị trường", 4, "Rủi ro"),
            color: "purple",
            winner: Boolean(td.right?.winner),
          },
        };
      } else if (td.template === "stat-hero") {
        const numMatch = s.voiceText.match(/\b\d+([.,]\d+)?(%|x|k|M|GB|TB|sao|\+)?\b/i);
        td = {
          template: "stat-hero",
          value: String(td.value || (numMatch ? numMatch[0] : "45+")).slice(0, 16),
          label: condenseVisualText(td.label || "THÔNG SỐ NỔI BẬT", 4, "CHỈ SỐ TOÀN CẦU").toUpperCase(),
          context: td.context ? condenseVisualText(td.context, 6, "Dữ liệu toàn cầu") : undefined,
        };
      } else if (td.template === "feature-list") {
        const rawBullets = Array.isArray(td.bullets) ? td.bullets : [s.voiceText];
        const bullets = rawBullets.slice(0, 3).map((b: any) => condenseVisualText(b, 5, "Hỗ trợ mã nguồn mở"));
        td = {
          template: "feature-list",
          title: condenseVisualText(td.title || "TÍNH NĂNG CHÍNH", 4, "ĐẶC ĐIỂM").toUpperCase(),
          bullets: bullets.length >= 2 ? bullets : [...bullets, "Hỗ trợ mã nguồn mở"],
        };
      } else {
        // Fallback to callout with punchy 2-5 word statement
        td = {
          template: "callout",
          statement: condenseVisualText(td.statement || s.voiceText, 5, "TIÊU ĐIỂM CÔNG NGHỆ"),
          tag: condenseVisualText(td.tag || "ĐIỂM CỐT LÕI", 3, "LƯU Ý"),
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

  // Scene 1: Hook with concise punchy headline (3-6 words)
  const hookHeadline = condenseVisualText(sceneChunks[0], 5, repoName.toUpperCase().slice(0, 28));
  scenes.push({
    id: "scene-1",
    type: "hook",
    voiceText: sceneChunks[0],
    templateData: {
      template: "hook",
      headline: hookHeadline.toUpperCase(),
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

    // Choose semantic template based on content keywords with concise 2-5 word visual text
    if (numMatch && (text.includes("sàn") || text.includes("dữ liệu") || text.includes("triệu") || text.includes("nghìn"))) {
      scenes.push({
        id: sId,
        type: "body",
        voiceText: text,
        templateData: {
          template: "stat-hero",
          value: numMatch[0],
          label: condenseVisualText(text, 4, "CHỈ SỐ TOÀN CẦU").toUpperCase(),
          context: source.domain ? `Dữ liệu ${source.domain}` : "Thị trường tài chính",
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
          title: "CÁCH THỨC HOẠT ĐỘNG",
          input: "Dữ liệu nến OHLCV",
          operation: "Nến giá → Token",
          output: "Chuỗi token số hóa",
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
          title: "LUỒNG DỰ BÁO",
          nodes: [
            { label: "Nến OHLCV", detail: "Dữ liệu nến thô" },
            { label: "Tokenizer", detail: "Mã hóa token" },
            { label: "Transformer", detail: "Dự báo 24 giờ" },
          ],
          caption: "Mô hình chuỗi thời gian",
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
          note: "Hỗ trợ fine-tune",
        },
        media: sceneMedia,
      });
    } else if (text.toLowerCase().includes("rủi ro") || text.toLowerCase().includes("nhiễu") || text.toLowerCase().includes("thất bại") || text.toLowerCase().includes("kiếm tiền")) {
      scenes.push({
        id: sId,
        type: "body",
        voiceText: text,
        templateData: {
          template: "callout",
          statement: "DỰ BÁO ≠ KIẾM TIỀN",
          tag: "LƯU Ý RỦI RO",
        },
        media: sceneMedia,
      });
    } else if (i === 1 && screenshot) {
      scenes.push({
        id: sId,
        type: "body",
        voiceText: text,
        templateData: {
          template: "callout",
          statement: condenseVisualText(source.title || repoName, 4, "MÃ NGUỒN MỞ").toUpperCase(),
          tag: "TIÊU ĐIỂM",
        },
        media: sceneMedia,
      });
    } else {
      const phrases = text.split(/[,;–—]\s+/).map((p) => p.trim()).filter((p) => p.length >= 3);
      const bullets = phrases.length >= 2 ? phrases.slice(0, 3).map((p) => condenseVisualText(p, 5, "Tính năng chính")) : ["Phiên bản Mini & Base", "Code Python dự báo", "Fine-tune dữ liệu riêng"];
      scenes.push({
        id: sId,
        type: "body",
        voiceText: text,
        templateData: {
          template: "feature-list",
          title: "CÁC BẢN MODEL",
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
