import { z } from "zod";
import type { LLMProvider } from "../script/types.js";
import type { SourceContent } from "../script/types.js";
import { Scene, type SceneType } from "../render/script-schema.js";
import { cleanLlmJson } from "../script/generator.js";
import { normalizeText } from "../captions/audio-aligner.js";
import { log } from "../utils/logger.js";
import type { VisualAsset } from "./visuals.js";
import type { CaptionCue } from "../captions/types.js";
import { evaluateSceneDiversity, optimizeSceneDiversity, type DiversityReport } from "./diversity.js";

export interface CreativePlannerParams {
  transcript: string;
  url: string;
  source: SourceContent;
  availableAssets: VisualAsset[];
  llmProvider?: LLMProvider | null;
  channelName?: string;
  srtCues?: CaptionCue[];
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
Nhiệm vụ: Bạn nhận được kịch bản lời đọc (Voice Script), danh sách tài nguyên hình ảnh thực tế (ASSETS ĐANG CÓ), và tùy chọn DANH SÁCH CUES TỪ SRT.
Bạn phải phân tích ngữ nghĩa từng phân đoạn để chọn bố cục thị giác, phân loại mục đích nội dung và chuyển động phù hợp nhất.

QUY TẮC BẮT BUỘC:
1. NGUYÊN TẮC PHÂN CẢNH VỚI SRT CUES (KHI CÓ DANH SÁCH CUES):
   - Mỗi scene BẮT BUỘC được tạo từ một nhóm cue SRT liên tiếp bằng 2 trường: "startCueId" và "endCueId" (số nguyên dương).
   - Cue sau phải nối tiếp ngay sau cue trước: Scene 1 (ví dụ 1 đến 3), Scene 2 (4 đến 6)...
   - Tuyệt đối KHÔNG tự tạo timestamp giây (startSec/endSec).
   - Không được để chồng lấn (overlap) và không được tạo khoảng trống (gap) giữa các cue.
   - Không chia cắt giữa chừng một cue.

2. PHÂN LOẠI NGỮ NGHĨA NỘI DUNG (semanticIntent):
   Mỗi cảnh BẮT BUỘC chỉ định đúng 1 trường "semanticIntent" phản ánh nội dung có thật:
   * "hook": Mở đầu kích thích tò mò (Chỉ dùng cho cảnh 1).
   * "explanation": Giải thích khái niệm, cơ chế, luồng hoạt động hoặc tính năng.
   * "statistic": Con số ấn tượng. CHỈ ĐƯỢC CHỌN KHI CÂU NÓI CÓ CHỨA SỐ LIỆU THỰC TẾ (%, triệu, x, sàn, sao...). TUYỆT ĐỐI KHÔNG TỰ BỊA CON SỐ.
   * "comparison": So sánh đối chiếu (Trước vs Sau, Thử nghiệm vs Thực tế). CHỈ CHỌN KHI CÓ TỪ NGỮ SO SÁNH THẬT.
   * "demonstration": Minh họa demo giao diện hoặc đoạn code kỹ thuật thực tế.
   * "warning": Cảnh báo rủi ro, lưu ý thị trường, hạn chế kỹ thuật.
   * "conclusion": Tổng kết nhận định cốt lõi.
   * "cta": Kêu gọi hành động, theo dõi kênh (Chỉ dùng cho cảnh cuối).

3. CHỈ ĐỊNH CHUYỂN ĐỘNG & SỰ KIỆN THỊ GIÁC (MOTION & VISUAL EVENTS):
   - "motionPreset": chọn trong ["subtle", "energetic", "dramatic", "explanatory", "minimal"] (mặc định "explanatory").
   - "motionIntensity": chọn trong ["low", "medium", "high"] (mặc định "medium").
   - "visualEvents": danh sách sự kiện kích hoạt theo cue (tối đa 3 sự kiện/cảnh):
     [
       {
         "targetCueId": 2,
         "eventType": "highlight", // "reveal" | "highlight" | "pulse" | "focus" | "shimmer" | "bounce"
         "targetElement": "heading", // "heading" | "subhead" | "media" | "card" | "badge" | "bullet" | "metric"
         "timingSource": "cue-start" // "cue-start" | "cue-end" | "cue-middle" | "scene-start"
       }
     ]
   - AN TOÀN TUYỆT ĐỐI: KHÔNG xuất mã JavaScript, GSAP code hay HTML script tùy ý. Chỉ sử dụng đúng các giá trị enum quy định ở trên.

4. BẢNG TEMPLATE CHUẨN (CHỈ CHỌN TEMPLATE PHÙ HỢP NỘI DUNG THẬT):
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

5. TÁCH BIỆT HOÀN TOÀN GIỮA LỜI ĐỌC VÀ CHỮ TRÊN MÀN HÌNH (VISUAL TEXT):
   - Phụ đề (captions) chạy bên dưới đã hiển thị toàn bộ lời nói của người thuyết minh.
   - Chữ hiển thị trên card (Visual Text) CHỈ LÀ TIÊU ĐỀ THỊ GIÁC NGẮN GỌN (Punchy Visual Cues), TUYỆT ĐỐI KHÔNG COPY NGUYÊN VĂN CÂU NÓI!
   - Quy tắc độ dài nghiêm ngặt:
     * Hook headline: 3–6 từ (VD: "AI ĐỌC BIỂU ĐỒ BITCOIN?").
     * Headline scene / Callout statement: 2–5 từ (VD: "45+ SÀN GIAO DỊCH", "DỰ BÁO ≠ KIẾM TIỀN").
     * Subhead / Context: Tối đa 8 từ.
     * Bullets (feature-list): 2–6 từ.

6. ĐỊNH DẠNG ĐẦU RA:
   Chỉ trả về JSON thuần túy:
   {
     "scenes": [
       {
         "id": "scene-1",
         "type": "hook",
         "startCueId": 1,
         "endCueId": 2,
         "semanticIntent": "hook",
         "motionPreset": "energetic",
         "motionIntensity": "high",
         "templateData": { "template": "hook", "headline": "...", "subhead": "..." }
       }
     ]
   }
`.trim();

/**
 * Repairs and normalizes an LLM visual plan so it conforms strictly to the Zod SceneSchema.
 */
export function repairAndNormalizeLlmPlan(
  rawScenes: any[],
  availableAssets: VisualAsset[],
  originalTranscript: string,
  srtCues?: CaptionCue[]
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

  // Normalize cue ranges if srtCues are present
  let normalizedCueGroupings: Array<{ startCueId: number; endCueId: number }> | undefined;
  if (Array.isArray(srtCues) && srtCues.length > 0) {
    const candidateGroupings = rawScenes
      .map((s) => ({
        startCueId: Number(s.startCueId ?? s.cueRange?.startCueId),
        endCueId: Number(s.endCueId ?? s.cueRange?.endCueId),
      }))
      .filter((g) => Number.isInteger(g.startCueId) && Number.isInteger(g.endCueId) && g.startCueId > 0 && g.endCueId >= g.startCueId);

    if (candidateGroupings.length === rawScenes.length) {
      let expectedStart = srtCues[0].id;
      normalizedCueGroupings = [];
      for (let i = 0; i < candidateGroupings.length; i++) {
        let gStart = candidateGroupings[i].startCueId;
        let gEnd = candidateGroupings[i].endCueId;
        if (gStart !== expectedStart) gStart = expectedStart;
        if (gEnd < gStart) gEnd = gStart;
        if (i === candidateGroupings.length - 1) gEnd = srtCues[srtCues.length - 1].id;
        normalizedCueGroupings.push({ startCueId: gStart, endCueId: gEnd });
        expectedStart = gEnd + 1;
        if (expectedStart > srtCues[srtCues.length - 1].id) break;
      }
      if (normalizedCueGroupings.length > 0) {
        normalizedCueGroupings[normalizedCueGroupings.length - 1].endCueId = srtCues[srtCues.length - 1].id;
      }
    } else {
      // Deterministic partitioning across rawScenes
      const targetCount = Math.max(2, Math.min(rawScenes.length, srtCues.length));
      const chunkSize = Math.ceil(srtCues.length / targetCount);
      normalizedCueGroupings = [];
      let cur = 0;
      for (let s = 0; s < targetCount && cur < srtCues.length; s++) {
        const startId = srtCues[cur].id;
        const endIdx = s === targetCount - 1 ? srtCues.length - 1 : Math.min(srtCues.length - 1, cur + chunkSize - 1);
        normalizedCueGroupings.push({ startCueId: startId, endCueId: srtCues[endIdx].id });
        cur = endIdx + 1;
      }
    }
  }

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

    // Assign cueRange and voiceText if srtCues are present
    if (normalizedCueGroupings && normalizedCueGroupings[idx]) {
      const grp = normalizedCueGroupings[idx];
      s.cueRange = { startCueId: grp.startCueId, endCueId: grp.endCueId };
      const matched = srtCues!.filter((c) => c.id >= grp.startCueId && c.id <= grp.endCueId);
      if (matched.length > 0) {
        s.voiceText = matched.map((c) => c.text).join(" ");
      }
    }

    const voiceText = s.voiceText || "";

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
        statement: condenseVisualText(td.caption || td.title || td.statement || voiceText, 5, "TIÊU ĐIỂM CÔNG NGHỆ"),
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
        headline: condenseVisualText(td.headline || td.title || voiceText, 5, "CÔNG NGHỆ MỚI").toUpperCase(),
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
          note: td.note ? condenseVisualText(td.note, 6, "Hỗ trợ tùy biến") : undefined,
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
        const numMatch = voiceText.match(/\b\d+([.,]\d+)?(%|x|k|M|GB|TB|sao|\+)?\b/i);
        if (numMatch) {
          td = {
            template: "stat-hero",
            value: String(td.value || numMatch[0]).slice(0, 16),
            label: condenseVisualText(td.label || "THÔNG SỐ NỔI BẬT", 4, "CHỈ SỐ TOÀN CẦU").toUpperCase(),
            context: td.context ? condenseVisualText(td.context, 6, "Dữ liệu toàn cầu") : undefined,
          };
        } else {
          // Guard: No numbers in text -> Demote to callout to avoid hallucinating stats
          td = {
            template: "callout",
            statement: condenseVisualText(td.label || voiceText, 5, "TIÊU ĐIỂM CÔNG NGHỆ"),
            tag: "TIÊU ĐIỂM",
          };
        }
      } else if (td.template === "feature-list") {
        const rawBullets = Array.isArray(td.bullets) ? td.bullets : [voiceText];
        const bullets = rawBullets.slice(0, 3).map((b: any) => condenseVisualText(b, 5, "Hỗ trợ mã nguồn mở"));
        td = {
          template: "feature-list",
          title: condenseVisualText(td.title || "TÍNH NĂNG CHÍNH", 4, "ĐẶC ĐIỂM").toUpperCase(),
          bullets: bullets.length >= 2 ? bullets : [...bullets, "Hỗ trợ mã nguồn mở"],
        };
      } else {
        td = {
          template: "callout",
          statement: condenseVisualText(td.statement || voiceText, 5, "TIÊU ĐIỂM CÔNG NGHỆ"),
          tag: condenseVisualText(td.tag || "ĐIỂM CỐT LÕI", 3, "LƯU Ý"),
        };
      }
    }

    s.templateData = td;

    // 3. Normalize semanticIntent
    const validIntents = new Set(["hook", "explanation", "statistic", "comparison", "demonstration", "warning", "conclusion", "cta"]);
    if (s.type === "hook") {
      s.semanticIntent = "hook";
    } else if (s.type === "outro") {
      s.semanticIntent = "cta";
    } else if (validIntents.has(s.semanticIntent)) {
      if (s.semanticIntent === "statistic" && td.template !== "stat-hero") {
        s.semanticIntent = "explanation";
      }
    } else {
      if (td.template === "stat-hero") s.semanticIntent = "statistic";
      else if (td.template === "comparison") s.semanticIntent = "comparison";
      else if (td.template === "code-window" || td.template === "phone-mockup") s.semanticIntent = "demonstration";
      else if (td.template === "callout" && /rủi ro|nhiễu|lưu ý|cẩn trọng|thất bại/i.test(voiceText)) s.semanticIntent = "warning";
      else s.semanticIntent = "explanation";
    }

    // 4. Normalize motionPreset & motionIntensity
    const validPresets = new Set(["subtle", "energetic", "dramatic", "explanatory", "minimal", "calm", "dynamic"]);
    s.motionPreset = validPresets.has(s.motionPreset) ? s.motionPreset : (s.type === "hook" ? "energetic" : s.type === "outro" ? "dramatic" : "explanatory");

    const validIntensities = new Set(["low", "medium", "high"]);
    s.motionIntensity = validIntensities.has(s.motionIntensity) ? s.motionIntensity : (s.type === "hook" ? "high" : "medium");

    // 5. Normalize visualEvents
    const validEventTypes = new Set([
      "reveal",
      "stagger-reveal",
      "keyword-pop",
      "number-count",
      "highlight-sweep",
      "diagram-step",
      "comparison-reveal",
      "focus-shift",
      "subtle-pulse",
      "highlight",
      "pulse",
      "focus",
      "shimmer",
      "bounce",
    ]);
    const validTimings = new Set(["cue-start", "cue-end", "cue-middle", "scene-start", "explicit-sec"]);

    if (Array.isArray(s.visualEvents) && s.visualEvents.length > 0) {
      s.visualEvents = s.visualEvents
        .filter((ev: any) => ev && typeof ev === "object" && validEventTypes.has(ev.eventType))
        .slice(0, 4)
        .map((ev: any, evIdx: number) => ({
          id: `ev-${s.id}-${evIdx + 1}`,
          targetCueId: Number.isInteger(ev.targetCueId) ? ev.targetCueId : s.cueRange?.startCueId,
          eventType: ev.eventType,
          targetElement: String(ev.targetElement || "heading"),
          timingSource: validTimings.has(ev.timingSource) ? ev.timingSource : "cue-start",
          atSec: typeof ev.atSec === "number" && ev.atSec >= 0 ? ev.atSec : undefined,
          durationSec: typeof ev.durationSec === "number" && ev.durationSec > 0 ? Math.min(3, ev.durationSec) : 0.35,
          motionPreset: s.motionPreset,
          motionIntensity: s.motionIntensity,
        }));
    } else {
      // Synthesize semantic visual events distributed across the scene's cues for dynamic visual pacing
      const t = s.templateData.template;
      const startCue = s.cueRange?.startCueId ?? 1;
      const endCue = s.cueRange?.endCueId ?? startCue;
      const cueSpan = Math.max(1, endCue - startCue + 1);
      const midCue = startCue + Math.floor(cueSpan / 2);
      const lateCue = startCue + Math.floor((cueSpan * 3) / 4);
      const autoEvents: any[] = [];

      if (t === "hook" || t === "kinetic-headline") {
        autoEvents.push(
          { id: `ev-${s.id}-1`, targetCueId: startCue, eventType: "reveal", targetElement: "media", timingSource: "cue-start", durationSec: 0.35, motionPreset: s.motionPreset, motionIntensity: s.motionIntensity },
          { id: `ev-${s.id}-2`, targetCueId: Math.min(endCue, startCue + 1), eventType: "keyword-pop", targetElement: "heading", timingSource: "cue-start", durationSec: 0.45, motionPreset: s.motionPreset, motionIntensity: s.motionIntensity }
        );
        if (cueSpan >= 4) {
          autoEvents.push({ id: `ev-${s.id}-3`, targetCueId: midCue, eventType: "highlight-sweep", targetElement: "badge", timingSource: "cue-start", durationSec: 0.5, motionPreset: s.motionPreset, motionIntensity: s.motionIntensity });
        }
      } else if (t === "stat-hero") {
        autoEvents.push(
          { id: `ev-${s.id}-1`, targetCueId: startCue, eventType: "reveal", targetElement: "card", timingSource: "cue-start", durationSec: 0.35, motionPreset: s.motionPreset, motionIntensity: s.motionIntensity },
          { id: `ev-${s.id}-2`, targetCueId: midCue, eventType: "number-count", targetElement: "metric", timingSource: "cue-start", durationSec: 0.55, motionPreset: s.motionPreset, motionIntensity: s.motionIntensity },
          { id: `ev-${s.id}-3`, targetCueId: Math.min(endCue, midCue + 1), eventType: "highlight-sweep", targetElement: "metric", timingSource: "cue-middle", durationSec: 0.6, motionPreset: s.motionPreset, motionIntensity: s.motionIntensity }
        );
      } else if (t === "feature-list" || t === "step-by-step") {
        autoEvents.push(
          { id: `ev-${s.id}-1`, targetCueId: startCue, eventType: "stagger-reveal", targetElement: "bullet", timingSource: "cue-start", durationSec: 0.4, motionPreset: s.motionPreset, motionIntensity: s.motionIntensity }
        );
        if (cueSpan >= 3) {
          autoEvents.push(
            { id: `ev-${s.id}-2`, targetCueId: midCue, eventType: "highlight-sweep", targetElement: "bullet", timingSource: "cue-start", durationSec: 0.45, motionPreset: s.motionPreset, motionIntensity: s.motionIntensity }
          );
        }
        if (cueSpan >= 5) {
          autoEvents.push(
            { id: `ev-${s.id}-3`, targetCueId: lateCue, eventType: "subtle-pulse", targetElement: "card", timingSource: "cue-start", durationSec: 0.4, motionPreset: s.motionPreset, motionIntensity: s.motionIntensity }
          );
        }
      } else if (t === "comparison") {
        autoEvents.push(
          { id: `ev-${s.id}-1`, targetCueId: startCue, eventType: "comparison-reveal", targetElement: "card", timingSource: "cue-start", durationSec: 0.4, motionPreset: s.motionPreset, motionIntensity: s.motionIntensity },
          { id: `ev-${s.id}-2`, targetCueId: midCue, eventType: "comparison-reveal", targetElement: "card", timingSource: "cue-start", durationSec: 0.4, motionPreset: s.motionPreset, motionIntensity: s.motionIntensity }
        );
      } else if (t === "data-flow" || t === "worked-example") {
        autoEvents.push(
          { id: `ev-${s.id}-1`, targetCueId: startCue, eventType: "diagram-step", targetElement: "badge", timingSource: "cue-start", durationSec: 0.35, motionPreset: s.motionPreset, motionIntensity: s.motionIntensity }
        );
        if (cueSpan >= 3) {
          autoEvents.push({ id: `ev-${s.id}-2`, targetCueId: midCue, eventType: "highlight-sweep", targetElement: "heading", timingSource: "cue-start", durationSec: 0.45, motionPreset: s.motionPreset, motionIntensity: s.motionIntensity });
        }
        if (cueSpan >= 5) {
          autoEvents.push({ id: `ev-${s.id}-3`, targetCueId: lateCue, eventType: "focus-shift", targetElement: "card", timingSource: "cue-start", durationSec: 0.4, motionPreset: s.motionPreset, motionIntensity: s.motionIntensity });
        }
      } else if (t === "callout" || t === "quote-card") {
        autoEvents.push(
          { id: `ev-${s.id}-1`, targetCueId: startCue, eventType: "reveal", targetElement: "card", timingSource: "cue-start", durationSec: 0.35, motionPreset: s.motionPreset, motionIntensity: s.motionIntensity },
          { id: `ev-${s.id}-2`, targetCueId: midCue, eventType: "subtle-pulse", targetElement: "icon", timingSource: "cue-start", durationSec: 0.4, motionPreset: s.motionPreset, motionIntensity: s.motionIntensity }
        );
      } else if (t === "visual-focus" || t === "phone-mockup") {
        autoEvents.push(
          { id: `ev-${s.id}-1`, targetCueId: startCue, eventType: "reveal", targetElement: "media", timingSource: "cue-start", durationSec: 0.4, motionPreset: s.motionPreset, motionIntensity: s.motionIntensity },
          { id: `ev-${s.id}-2`, targetCueId: midCue, eventType: "focus-shift", targetElement: "media", timingSource: "cue-start", durationSec: 0.6, motionPreset: s.motionPreset, motionIntensity: s.motionIntensity }
        );
      } else {
        autoEvents.push({ id: `ev-${s.id}-1`, targetCueId: startCue, eventType: "reveal", targetElement: "card", timingSource: "cue-start", durationSec: 0.35, motionPreset: s.motionPreset, motionIntensity: s.motionIntensity });
      }

      s.visualEvents = autoEvents;
    }

    // 6. Check media resolution & filter out avatars/logos from body scenes
    if (s.media && typeof s.media === "object") {
      let resolvedSrc = s.media.src;
      const asset = assetByLabelOrKind(resolvedSrc);
      if (asset) resolvedSrc = asset.previewUrl;

      // Strict relevance: Never allow owner-avatar or repo-logo on body scenes!
      if (s.type === "body" && asset && (asset.kind === "owner-avatar" || asset.kind === "repo-logo")) {
        s.media = undefined;
      } else {
        s.media = {
          type: s.media.type === "video" ? "video" : s.media.type === "screenshot" ? "screenshot" : "image",
          src: resolvedSrc,
          fit: s.media.fit === "contain" ? "contain" : "cover",
          fx: s.media.fx === "none" ? "none" : "kenburns",
          presentation: s.media.presentation || "card",
        };
      }
    }

    // Guard visual-focus template against avatar
    if (s.templateData.template === "visual-focus" && s.type === "body") {
      const vAsset = assetByLabelOrKind(s.templateData.mediaSrc || "");
      if (vAsset && (vAsset.kind === "owner-avatar" || vAsset.kind === "repo-logo")) {
        // Demote to step-by-step or callout to avoid showing large avatar in tech explanation
        s.templateData = {
          template: "step-by-step",
          title: "CÁC PHIÊN BẢN & MÃ NGUỒN",
          steps: [
            { step: "01", label: "Bản Mini & Small", detail: "Nhẹ, tối ưu thử nghiệm nhanh" },
            { step: "02", label: "Bản Base", detail: "Độ chính xác chuỗi thời gian tối đa" },
            { step: "03", label: "Python & Fine-tune", detail: "Chạy dự báo và huấn luyện riêng" },
          ],
        };
        s.media = undefined;
      }
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
  channelName = "DevPeek36",
  srtCues?: CaptionCue[]
): SceneType[] {
  log.info(`[Creative Planner] Generating high-quality semantic fallback visual plan...`);

  const screenshot = assets.find((a) => a.kind === "screenshot");
  const readmeImages = assets.filter((a) => a.kind === "readme-image");
  const logo = assets.find((a) => a.kind === "repo-logo" || a.kind === "owner-avatar");
  const repoName = source.url.includes("github.com") ? source.url.split("/").pop()?.replace(/\.git$/, "") || source.title : source.title;

  interface ChunkInfo {
    text: string;
    startCueId?: number;
    endCueId?: number;
  }

  const chunks: ChunkInfo[] = [];

  if (Array.isArray(srtCues) && srtCues.length > 0) {
    const sceneCount = Math.max(4, Math.min(8, Math.ceil(srtCues.length / 3)));
    const chunkSize = Math.ceil(srtCues.length / sceneCount);
    let cur = 0;
    for (let s = 0; s < sceneCount && cur < srtCues.length; s++) {
      const slice = s === sceneCount - 1 ? srtCues.slice(cur) : srtCues.slice(cur, cur + chunkSize);
      chunks.push({
        text: slice.map((c) => c.text).join(" "),
        startCueId: slice[0].id,
        endCueId: slice[slice.length - 1].id,
      });
      cur += slice.length;
    }
  } else {
    // Split transcript into sentences
    const rawSentences = transcript
      .split(/(?<=[.!?])\s+|\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const sentences = rawSentences.length > 0 ? rawSentences : [transcript.trim()];
    const sceneCount = Math.max(4, Math.min(8, sentences.length));
    const chunkSize = Math.ceil(sentences.length / sceneCount);

    for (let i = 0; i < sentences.length; i += chunkSize) {
      chunks.push({ text: sentences.slice(i, i + chunkSize).join(" ") });
    }

    if (chunks.length < 4) {
      while (chunks.length < 4) {
        const longestIdx = chunks.reduce((maxI, chunk, i) => (chunk.text.length > chunks[maxI].text.length ? i : maxI), 0);
        const words = chunks[longestIdx].text.split(" ");
        const mid = Math.floor(words.length / 2);
        chunks.splice(longestIdx, 1, { text: words.slice(0, mid).join(" ") }, { text: words.slice(mid).join(" ") });
      }
    }
  }

  const scenes: SceneType[] = [];

  // Scene 1: Hook
  const hookHeadline = condenseVisualText(chunks[0].text, 5, repoName.toUpperCase().slice(0, 28));
  scenes.push({
    id: "scene-1",
    type: "hook",
    voiceText: chunks[0].text,
    semanticIntent: "hook",
    motionPreset: "energetic",
    motionIntensity: "high",
    cueRange: chunks[0].startCueId && chunks[0].endCueId ? { startCueId: chunks[0].startCueId, endCueId: chunks[0].endCueId } : undefined,
    templateData: {
      template: "hook",
      headline: hookHeadline.toUpperCase(),
      subhead: source.domain ? `Nguồn: ${source.domain}` : "MÃ NGUỒN MỞ",
      kenBurns: "zoom-in",
    },
    media: logo ? { type: "image", src: logo.previewUrl, fit: "contain", fx: "none", presentation: "logo" } : undefined,
  });

  // Body scenes
  let readmeImgIdx = 0;
  for (let i = 1; i < chunks.length - 1; i++) {
    const text = chunks[i].text;
    const sId = `scene-${i + 1}`;
    const numMatch = text.match(/\b\d+([.,]\d+)?(%|x|k|M|GB|TB|sao|\+)?\b/i);
    const cueRange = chunks[i].startCueId && chunks[i].endCueId ? { startCueId: chunks[i].startCueId!, endCueId: chunks[i].endCueId! } : undefined;

    let sceneMedia = undefined;
    if (i === 1 && screenshot) {
      sceneMedia = { type: "screenshot" as const, src: screenshot.previewUrl, fit: "cover" as const, fx: "kenburns" as const, presentation: "card" as const };
    } else if (readmeImages.length > 0 && readmeImgIdx < readmeImages.length) {
      const img = readmeImages[readmeImgIdx++];
      sceneMedia = { type: "image" as const, src: img.previewUrl, fit: "cover" as const, fx: "kenburns" as const, presentation: "card" as const };
    }

    if (numMatch && (text.includes("sàn") || text.includes("dữ liệu") || text.includes("triệu") || text.includes("nghìn"))) {
      scenes.push({
        id: sId,
        type: "body",
        voiceText: text,
        semanticIntent: "statistic",
        motionPreset: "energetic",
        motionIntensity: "high",
        cueRange,
        templateData: {
          template: "stat-hero",
          value: numMatch[0],
          label: condenseVisualText(text, 4, "CHỈ SỐ NỔI BẬT").toUpperCase(),
          context: "Dữ liệu huấn luyện toàn cầu",
        },
        media: sceneMedia,
      });
    } else if (text.includes("nến") && text.includes("token")) {
      scenes.push({
        id: sId,
        type: "body",
        voiceText: text,
        semanticIntent: "explanation",
        motionPreset: "explanatory",
        motionIntensity: "medium",
        cueRange,
        templateData: {
          template: "data-flow",
          title: "KIẾN TRÚC MÔ HÌNH",
          nodes: [
            { label: "ĐẦU VÀO", detail: "Dữ liệu nến OHLCV" },
            { label: "MÃ HÓA", detail: "Nến giá → Token" },
            { label: "DỰ BÁO", detail: "Dự đoán xu hướng BTC" },
          ],
          caption: "Mô hình ngôn ngữ xử lý chuỗi thời gian",
        },
        media: sceneMedia,
      });
    } else if (text.includes("thử nghiệm") || text.includes("thực tế") || text.includes("nhiễu")) {
      scenes.push({
        id: sId,
        type: "body",
        voiceText: text,
        semanticIntent: "comparison",
        motionPreset: "dramatic",
        motionIntensity: "medium",
        cueRange,
        templateData: {
          template: "comparison",
          left: { label: "Thử Nghiệm", value: "Độ chính xác cao", color: "cyan" },
          right: { label: "Thực Tế", value: "Thị trường nhiễu", color: "purple", winner: false },
        },
        media: sceneMedia,
      });
    } else if (text.includes("rủi ro") || text.includes("cẩn trọng") || text.includes("kiếm tiền")) {
      scenes.push({
        id: sId,
        type: "body",
        voiceText: text,
        semanticIntent: "warning",
        motionPreset: "subtle",
        motionIntensity: "medium",
        cueRange,
        templateData: {
          template: "callout",
          statement: text.includes("kiếm tiền") ? "DỰ BÁO ≠ KIẾM TIỀN" : "RỦI RO THỊ TRƯỜNG",
          tag: "LƯU Ý RỦI RO",
        },
        media: sceneMedia,
      });
    } else if (i === 1 && screenshot) {
      scenes.push({
        id: sId,
        type: "body",
        voiceText: text,
        semanticIntent: "demonstration",
        motionPreset: "explanatory",
        motionIntensity: "medium",
        cueRange,
        templateData: {
          template: "phone-mockup",
          title: condenseVisualText(source.title || repoName, 4, "GIAO DIỆN MINH HỌA").toUpperCase(),
          screenSrc: screenshot.previewUrl,
          caption: condenseVisualText(text, 6, "Giao diện kiểm thử"),
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
        semanticIntent: "explanation",
        motionPreset: "explanatory",
        motionIntensity: "medium",
        cueRange,
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
  const lastChunk = chunks[chunks.length - 1];
  scenes.push({
    id: `scene-${chunks.length}`,
    type: "outro",
    voiceText: lastChunk.text,
    semanticIntent: "cta",
    motionPreset: "dramatic",
    motionIntensity: "medium",
    cueRange: lastChunk.startCueId && lastChunk.endCueId ? { startCueId: lastChunk.startCueId, endCueId: lastChunk.endCueId } : undefined,
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
  const { transcript, url, source, availableAssets, llmProvider, channelName, srtCues } = params;

  if (llmProvider) {
    try {
      log.info(`[Creative Planner] Planning visuals using configured LLM (${llmProvider.name})...`);

      const assetDescriptions = availableAssets
        .map((a) => `- [${a.kind}] id: "${a.id}", label: "${a.label}", url: "${a.previewUrl}"`)
        .join("\n");

      let cueDescription = "";
      if (Array.isArray(srtCues) && srtCues.length > 0) {
        cueDescription = `\nDANH SÁCH CUES TỪ FILE SRT (${srtCues.length} cues):\n` +
          srtCues.map((c) => `[Cue ${c.id}] (${c.startSec.toFixed(2)}s -> ${c.endSec.toFixed(2)}s): "${c.text}"`).join("\n") +
          `\n\nCHÚ Ý QUAN TRỌNG: Hãy phân chia kịch bản theo đúng các Cue SRT trên. Mỗi scene bắt buộc có trường 'startCueId' và 'endCueId'. Không tự tạo timestamp giây.`;
      }

      const userPrompt = `
NỘI DUNG KỊCH BẢN CHỮ:
"""
${transcript.trim()}
"""
${cueDescription}

THÔNG TIN NGUỒN CÔNG KHAI:
- URL: ${url}
- Tiêu đề: ${source.title}
- Domain: ${source.domain}
- Trích đoạn tóm tắt: ${source.content.slice(0, 3500)}

DANH SÁCH ASSETS THẬT ĐANG CÓ TRÊN ĐĨA:
${assetDescriptions || "(Chưa có screenshot hay logo tải sẵn; chỉ dùng template chữ và bố cục đồ họa)"}

YÊU CẦU:
Hãy phân tích ngữ nghĩa kịch bản trên và trả về đúng 1 object JSON có dạng: { "scenes": [ ... ] }.
Đảm bảo giữ nguyên vẹn 100% câu chữ của kịch bản giọng đọc, không lặp template liên tiếp một cách máy móc, gán semanticIntent và motionPreset phù hợp.
`.trim();

      const rawLlmResponse = await llmProvider.generate(CREATIVE_PLANNER_SYSTEM_PROMPT, userPrompt);
      const cleanedJson = cleanLlmJson(rawLlmResponse);
      const parsed = JSON.parse(cleanedJson);

      const candidateScenes = parsed.scenes || parsed;
      const repairedScenes = repairAndNormalizeLlmPlan(candidateScenes, availableAssets, transcript, srtCues);
      const validatedScenes = validateVisualPlan(repairedScenes, transcript);

      // Task B: Apply diversity scoring & optimization
      const { scenes: diverseScenes, report: diversityReport } = optimizeSceneDiversity(validatedScenes, availableAssets, srtCues);
      log.info(`[Creative Planner] Scene diversity score: ${diversityReport.diversityScore}/100 (isDiverse: ${diversityReport.isDiverse})`);
      if (diversityReport.warnings.length > 0) {
        log.warn(`[Creative Planner] Diversity warnings: ${diversityReport.warnings.join("; ")}`);
      }

      return diverseScenes;
    } catch (err: any) {
      log.warn(`[Creative Planner] LLM visual planning failed: ${err.message}. Falling back to deterministic plan.`);
    }
  }

  // Fallback to high-quality deterministic plan with normalized visual events
  const deterministicScenes = deterministicVisualPlanner(transcript, source, availableAssets, channelName, srtCues);
  const normalizedFallback = repairAndNormalizeLlmPlan(deterministicScenes, availableAssets, transcript, srtCues);
  const { scenes: diverseFallback, report } = optimizeSceneDiversity(normalizedFallback, availableAssets, srtCues);
  log.info(`[Creative Planner] Deterministic diversity score: ${report.diversityScore}/100`);
  return diverseFallback;
}
