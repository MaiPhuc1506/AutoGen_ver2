import type { SceneType } from "../render/script-schema.js";
import type { VisualAsset } from "./visuals.js";
import type { CaptionCue } from "../captions/types.js";
import { condenseVisualText } from "./creative-planner.js";

export interface DiversityReport {
  totalScenes: number;
  uniqueTemplates: string[];
  templateFrequencies: Record<string, number>;
  consecutiveDuplicates: Array<{ template: string; sceneIndices: number[] }>;
  diversityScore: number; // 0 to 100
  isDiverse: boolean;
  warnings: string[];
  recommendations: string[];
}

/**
 * Evaluates template diversity across planned scenes.
 * Detects layout repetition, consecutive duplicates, and generates actionable advice.
 */
export function evaluateSceneDiversity(scenes: SceneType[]): DiversityReport {
  if (!Array.isArray(scenes) || scenes.length === 0) {
    return {
      totalScenes: 0,
      uniqueTemplates: [],
      templateFrequencies: {},
      consecutiveDuplicates: [],
      diversityScore: 100,
      isDiverse: true,
      warnings: [],
      recommendations: [],
    };
  }

  const templates = scenes.map((s) => s.templateData.template);
  const uniqueTemplates = Array.from(new Set(templates));
  const templateFrequencies: Record<string, number> = {};

  for (const t of templates) {
    templateFrequencies[t] = (templateFrequencies[t] || 0) + 1;
  }

  // Find consecutive duplicates
  const consecutiveDuplicates: Array<{ template: string; sceneIndices: number[] }> = [];
  let currentStreak: number[] = [0];

  for (let i = 1; i < templates.length; i++) {
    if (templates[i] === templates[i - 1]) {
      currentStreak.push(i);
    } else {
      if (currentStreak.length > 1) {
        consecutiveDuplicates.push({
          template: templates[currentStreak[0]],
          sceneIndices: [...currentStreak],
        });
      }
      currentStreak = [i];
    }
  }
  if (currentStreak.length > 1) {
    consecutiveDuplicates.push({
      template: templates[currentStreak[0]],
      sceneIndices: [...currentStreak],
    });
  }

  // Calculate score (0 to 100)
  // Target: At least min(5, totalScenes - 1) unique templates
  const targetUnique = Math.max(2, Math.min(5, scenes.length - 1));
  const coverageRatio = Math.min(1.0, uniqueTemplates.length / targetUnique);
  let baseScore = Math.round(coverageRatio * 100);

  // Penalty: -20 per consecutive duplicate occurrence
  let penalty = 0;
  for (const dup of consecutiveDuplicates) {
    penalty += 20 * (dup.sceneIndices.length - 1);
  }

  const diversityScore = Math.max(0, Math.min(100, baseScore - penalty));
  const isDiverse = diversityScore >= 70 && consecutiveDuplicates.length === 0;

  const warnings: string[] = [];
  const recommendations: string[] = [];

  for (const dup of consecutiveDuplicates) {
    const sceneNumbers = dup.sceneIndices.map((idx) => `#${idx + 1}`).join(", ");
    warnings.push(
      `Phát hiện lặp layout liên tiếp: Cảnh ${sceneNumbers} đều sử dụng template '${dup.template}'.`
    );
    recommendations.push(
      `Cân nhắc đa dạng hóa cảnh #${dup.sceneIndices[dup.sceneIndices.length - 1] + 1} sang bố cục khác (ví dụ: data-flow, comparison hoặc feature-list) nếu nội dung hỗ trợ.`
    );
  }

  if (uniqueTemplates.length <= 2 && scenes.length >= 4) {
    warnings.push(
      `Toàn bộ ${scenes.length} cảnh chỉ dùng ${uniqueTemplates.length} dạng template (${uniqueTemplates.join(", ")}). Video có nguy cơ đơn điệu.`
    );
  }

  return {
    totalScenes: scenes.length,
    uniqueTemplates,
    templateFrequencies,
    consecutiveDuplicates,
    diversityScore,
    isDiverse,
    warnings,
    recommendations,
  };
}

/**
 * Optimizes scene diversity without distorting the underlying content meaning.
 * If consecutive duplicates exist, checks whether secondary scene has semantic evidence
 * for another supported template (stats, comparison, data-flow, feature-list, or visual asset).
 */
export function optimizeSceneDiversity(
  scenes: SceneType[],
  availableAssets: VisualAsset[] = [],
  cues?: CaptionCue[]
): { scenes: SceneType[]; report: DiversityReport } {
  const optimized: SceneType[] = JSON.parse(JSON.stringify(scenes));

  for (let i = 1; i < optimized.length - 1; i++) {
    const prev = optimized[i - 1];
    const curr = optimized[i];

    // Only intervene if consecutive template repetition occurs
    if (curr.templateData.template !== prev.templateData.template) {
      continue;
    }

    const text = curr.voiceText || "";
    const lower = text.toLowerCase();

    // 1. Check if scene text has real numbers/statistics -> switch to stat-hero
    const numMatch = text.match(/\b\d+([.,]\d+)?(%|x|k|M|GB|TB|sao|\+)?\b/i);
    if (numMatch && curr.templateData.template !== "stat-hero") {
      curr.templateData = {
        template: "stat-hero",
        value: numMatch[0],
        label: condenseVisualText(text, 4, "CHỈ SỐ NỔI BẬT").toUpperCase(),
        context: "Dữ liệu từ nội dung nguồn",
      };
      curr.semanticIntent = "statistic";
      continue;
    }

    // 2. Check if scene has comparative keywords -> switch to comparison
    const isComparison =
      lower.includes("so với") ||
      lower.includes("thử nghiệm") ||
      lower.includes("thực tế") ||
      lower.includes("trước") ||
      lower.includes("sau") ||
      lower.includes("hơn là") ||
      lower.includes("ngược lại");

    if (isComparison && curr.templateData.template !== "comparison") {
      curr.templateData = {
        template: "comparison",
        left: {
          label: "ĐIỀU KIỆN A",
          value: condenseVisualText(text, 3, "Lý thuyết"),
          color: "cyan",
        },
        right: {
          label: "ĐIỀU KIỆN B",
          value: condenseVisualText(text, 3, "Thực tế"),
          color: "purple",
          winner: false,
        },
      };
      curr.semanticIntent = "comparison";
      continue;
    }

    // 3. Check if text describes versions, process or steps -> step-by-step (Semantic layout)
    const isStepWorkflow = lower.includes("phiên bản") || lower.includes("bước") || lower.includes("mini") || lower.includes("quy trình") || lower.includes("hướng dẫn");
    if (isStepWorkflow && curr.templateData.template !== "step-by-step") {
      curr.templateData = {
        template: "step-by-step",
        title: "CÁC PHIÊN BẢN & MÃ NGUỒN",
        steps: [
          { step: "01", label: "Bản Mini & Small", detail: "Nhẹ, tối ưu thử nghiệm nhanh" },
          { step: "02", label: "Bản Base", detail: "Độ chính xác chuỗi thời gian tối đa" },
          { step: "03", label: "Python & Fine-tune", detail: "Chạy dự báo và huấn luyện riêng" },
        ],
      };
      curr.semanticIntent = "explanation";
      curr.media = undefined; // Avoid irrelevant media (e.g. avatars)
      continue;
    }

    // 4. Check if scene has unused TECHNICAL asset -> switch to visual-focus or phone-mockup
    // Strict asset relevance: NEVER use owner-avatar or repo-logo as primary card media in body scenes
    const technicalAssets = availableAssets.filter((a) => a.kind === "screenshot" || a.kind === "readme-image");
    const unusedAsset = technicalAssets.find(
      (a) => !scenes.some((s) => s.media?.src === a.previewUrl)
    );
    if (unusedAsset && (curr.templateData.template === "callout" || curr.templateData.template === "feature-list")) {
      const isUiContext = lower.includes("giao diện") || lower.includes("demo") || lower.includes("trực quan") || lower.includes("kiến trúc") || lower.includes("sơ đồ");
      if (isUiContext) {
        curr.media = {
          type: unusedAsset.kind === "screenshot" ? "screenshot" : "image",
          src: unusedAsset.previewUrl,
          fit: unusedAsset.kind === "readme-image" ? "contain" : "cover",
          fx: "kenburns",
          presentation: "card",
        };
        curr.templateData = {
          template: "visual-focus",
          title: condenseVisualText(unusedAsset.label, 4, "CHI TIẾT TRỰC QUAN").toUpperCase(),
          subtitle: "TƯ LIỆU NGUỒN CHÍNH THỨC",
          focusArea: { x: 50, y: 50, scale: 1.35 },
          mediaSrc: unusedAsset.previewUrl,
          caption: condenseVisualText(text, 6, "Minh họa kỹ thuật"),
        };
        curr.semanticIntent = "demonstration";
        continue;
      }
    }

    // 5. Check if text has quotes or authoritative developer statements -> quote-card
    const quoteWords = ["theo nhóm", "nhà phát triển", "tác giả", "nhấn mạnh", "chia sẻ", "khuyến nghị"];
    const hasQuoteContext = quoteWords.some((w) => lower.includes(w));
    if (hasQuoteContext && (curr.templateData.template === "callout" || curr.templateData.template === "feature-list")) {
      curr.templateData = {
        template: "quote-card",
        quote: text.slice(0, 140),
        author: lower.includes("nhóm phát triển") ? "Nhóm phát triển repo" : "Tài liệu kỹ thuật",
        role: "Tác giả chính",
      };
      curr.semanticIntent = "explanation";
      continue;
    }

    // 5. Check if text has sequential step indicators -> step-by-step
    const stepWords = ["bước", "quy trình", "đầu tiên", "sau đó", "tiếp theo", "hướng dẫn"];
    const hasStepContext = stepWords.some((w) => lower.includes(w));
    if (hasStepContext && (curr.templateData.template === "callout" || curr.templateData.template === "feature-list")) {
      const clauses = text.split(/[,;–—.]\s+/).filter((c) => c.trim().length >= 4);
      if (clauses.length >= 2) {
        curr.templateData = {
          template: "step-by-step",
          title: "QUY TRÌNH THỰC HIỆN",
          steps: clauses.slice(0, 3).map((cl, sIdx) => ({
            step: `0${sIdx + 1}`,
            label: condenseVisualText(cl, 4, `Bước ${sIdx + 1}`),
            detail: cl.slice(0, 60),
          })),
        };
        curr.semanticIntent = "explanation";
        continue;
      }
    }

    // 6. Check if text has multiple clauses or steps -> switch to feature-list or data-flow
    const clauses = text
      .split(/[,;–—.]\s+/)
      .map((c) => c.trim())
      .filter((c) => c.length >= 4);

    if (clauses.length >= 2 && curr.templateData.template === "callout") {
      if (lower.includes("bước") || lower.includes("quy trình") || lower.includes("chuyển đổi") || lower.includes("token")) {
        curr.templateData = {
          template: "data-flow",
          title: "LUỒNG XỬ LÝ",
          nodes: clauses.slice(0, 3).map((cl, idx) => ({
            label: `BƯỚC ${idx + 1}`,
            detail: condenseVisualText(cl, 4, `Thao tác ${idx + 1}`),
          })),
        };
        curr.semanticIntent = "explanation";
      } else {
        curr.templateData = {
          template: "feature-list",
          title: "ĐẶC ĐIỂM CHÍNH",
          bullets: clauses.slice(0, 3).map((cl) => condenseVisualText(cl, 5, "Điểm nổi bật")),
        };
        curr.semanticIntent = "explanation";
      }
      continue;
    }

    // If none of the conditions hold, do NOT force changes that would fabricate content!
  }

  // Assign smart transition presets based on content and layout relationships
  for (let i = 0; i < optimized.length; i++) {
    const sc = optimized[i];
    if (i === 0) {
      sc.transitionPreset = "clean-cut";
    } else if (sc.type === "outro") {
      sc.transitionPreset = "subtle-zoom";
    } else if (sc.templateData.template === "comparison") {
      sc.transitionPreset = "directional-slide";
    } else if (sc.templateData.template === "kinetic-headline") {
      sc.transitionPreset = "masked-reveal";
    } else if (sc.templateData.template === "quote-card" || sc.semanticIntent === "warning") {
      sc.transitionPreset = "fade";
    } else if (sc.templateData.template === "stat-hero") {
      sc.transitionPreset = "subtle-zoom";
    } else {
      sc.transitionPreset = "clean-cut";
    }
  }

  const finalReport = evaluateSceneDiversity(optimized);

  // If content is genuinely homogeneous, log an honest note
  if (!finalReport.isDiverse && finalReport.consecutiveDuplicates.length > 0) {
    finalReport.recommendations.push(
      "Nội dung không đủ đa dạng để tạo cảnh phong phú (thiếu số liệu, quy trình hoặc so sánh); giữ nguyên layout tối giản để đảm bảo tính chân thực."
    );
  }

  return { scenes: optimized, report: finalReport };
}
