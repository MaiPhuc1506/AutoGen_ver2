import { existsSync } from "node:fs";
import type { Script, SceneType } from "../render/script-schema.js";
import type { CaptionCue } from "../captions/types.js";
import { evaluateSceneDiversity } from "../studio/diversity.js";

export type IssueSeverity = "BLOCKING" | "WARNING";

export interface QcIssue {
  code: string;
  severity: IssueSeverity;
  message: string;
  sceneId?: string;
  field?: string;
  details?: Record<string, any>;
}

export interface QcCheckResult {
  name: string;
  passed: boolean;
  issues: QcIssue[];
}

export interface HumanReviewItem {
  aspect: string;
  question: string;
  guidance: string;
  status: "NEEDS_HUMAN_INSPECTION";
}

export interface QcReport {
  passed: boolean;
  totalChecks: number;
  passedChecks: number;
  blockingCount: number;
  warningCount: number;
  blockingErrors: string[];
  warnings: string[];
  checks: Record<string, QcCheckResult>;
  score: number; // 0 to 100 (Automated Technical Compliance Score)
  evaluatedAt: string;
  humanReviewChecklist: HumanReviewItem[];
  aestheticNotice: string;
}

export interface QcEngineParams {
  script: Script;
  totalDurationSec: number;
  cues?: CaptionCue[];
  assetBasePath?: string;
  renderedHtml?: string;
}

/**
 * DevPeek36 Pre-Render Quality Control Engine.
 * Rigorously checks for timing gaps, overlaps, text overflow, missing assets,
 * visual beat out-of-bounds, safe area violations, and seek determinism.
 */
export function runPreRenderQc(params: QcEngineParams): QcReport {
  const { script, totalDurationSec, cues = [], assetBasePath } = params;
  const issues: QcIssue[] = [];
  const checkResults: Record<string, QcCheckResult> = {};

  function addCheck(name: string, checkIssues: QcIssue[]) {
    checkResults[name] = {
      name,
      passed: checkIssues.every((i) => i.severity !== "BLOCKING"),
      issues: checkIssues,
    };
    issues.push(...checkIssues);
  }

  // 1. Check Scene Timing (Gaps, Overlaps, Durations)
  const sceneTimingIssues: QcIssue[] = [];
  const boundaries = script.voice?.sceneBoundaries || [];
  const timelineScenes = script.timeline?.scenes || {};

  let prevEnd = 0;
  for (let i = 0; i < script.scenes.length; i++) {
    const sc = script.scenes[i];
    const isFirst = i === 0;
    const isLast = i === script.scenes.length - 1;

    let start = isFirst ? 0 : prevEnd;
    let end: number;

    if (timelineScenes[sc.id]) {
      start = timelineScenes[sc.id].start ?? start;
      end = start + (timelineScenes[sc.id].duration ?? 3.0);
    } else if (boundaries[i] !== undefined) {
      end = isLast ? totalDurationSec : boundaries[i];
    } else {
      end = isLast ? totalDurationSec : start + 3.0;
    }

    if (start < 0) {
      sceneTimingIssues.push({
        code: "SCENE_START_NEGATIVE",
        severity: "BLOCKING",
        message: `Cảnh ${sc.id} có thời điểm bắt đầu âm (${start}s).`,
        sceneId: sc.id,
      });
    }

    if (end <= start) {
      sceneTimingIssues.push({
        code: "SCENE_DURATION_NON_POSITIVE",
        severity: "BLOCKING",
        message: `Cảnh ${sc.id} có thời lượng không hợp lệ (start: ${start}s, end: ${end}s).`,
        sceneId: sc.id,
      });
    }

    if (!isFirst && Math.abs(start - prevEnd) > 0.05) {
      if (start > prevEnd) {
        sceneTimingIssues.push({
          code: "SCENE_GAP_DETECTED",
          severity: "BLOCKING",
          message: `Khoảng trống (gap ${(start - prevEnd).toFixed(2)}s) giữa cảnh ${script.scenes[i - 1].id} và ${sc.id}. Có nguy cơ black screen.`,
          sceneId: sc.id,
        });
      } else {
        sceneTimingIssues.push({
          code: "SCENE_OVERLAP_DETECTED",
          severity: "BLOCKING",
          message: `Chồng lấn (overlap ${(prevEnd - start).toFixed(2)}s) giữa cảnh ${script.scenes[i - 1].id} và ${sc.id}. Có nguy cơ flicker hình.`,
          sceneId: sc.id,
        });
      }
    }

    prevEnd = end;
  }
  addCheck("sceneTiming", sceneTimingIssues);

  // 2. Check Caption Timing & Duration
  const captionIssues: QcIssue[] = [];
  for (let ci = 0; ci < cues.length; ci++) {
    const cue = cues[ci];
    if (cue.startSec < 0) {
      captionIssues.push({
        code: "CAPTION_START_NEGATIVE",
        severity: "BLOCKING",
        message: `Cue #${cue.id} có timestamp âm (${cue.startSec}s).`,
      });
    }
    if (cue.endSec > totalDurationSec + 1.5) {
      captionIssues.push({
        code: "CAPTION_EXCEEDS_AUDIO",
        severity: "WARNING",
        message: `Cue #${cue.id} kết thúc (${cue.endSec.toFixed(2)}s) vượt quá thời lượng audio (${totalDurationSec.toFixed(2)}s).`,
      });
    }
    if (cue.endSec <= cue.startSec) {
      captionIssues.push({
        code: "CAPTION_INVALID_DURATION",
        severity: "BLOCKING",
        message: `Cue #${cue.id} có thời lượng <= 0 (${cue.startSec}s -> ${cue.endSec}s).`,
      });
    }
    const dur = cue.endSec - cue.startSec;
    if (dur > 12.0) {
      captionIssues.push({
        code: "CAPTION_UNUSUALLY_LONG",
        severity: "WARNING",
        message: `Cue #${cue.id} dài bất thường (${dur.toFixed(1)}s). Cân nhắc tách câu nếu có word alignment.`,
      });
    }
  }
  addCheck("captions", captionIssues);

  // 3. Check Visual Events Boundary & Targets
  const visualEventIssues: QcIssue[] = [];
  const validElements = new Set([
    "heading",
    "subhead",
    "media",
    "card",
    "badge",
    "bullet",
    "metric",
    "icon",
  ]);

  for (const sc of script.scenes) {
    if (Array.isArray(sc.visualEvents)) {
      const timing = timelineScenes[sc.id];
      const scDur = timing?.duration ?? 4.0;

      for (let ei = 0; ei < sc.visualEvents.length; ei++) {
        const ev = sc.visualEvents[ei];
        if (ev.durationSec !== undefined && (ev.durationSec <= 0 || ev.durationSec > scDur)) {
          visualEventIssues.push({
            code: "VISUAL_EVENT_DURATION_INVALID",
            severity: "WARNING",
            message: `Event '${ev.eventType}' trong cảnh ${sc.id} có duration (${ev.durationSec}s) vượt quá thời lượng cảnh (${scDur}s).`,
            sceneId: sc.id,
          });
        }
        if (ev.atSec !== undefined && (ev.atSec < 0 || ev.atSec >= scDur)) {
          visualEventIssues.push({
            code: "VISUAL_EVENT_OUT_OF_BOUNDS",
            severity: "WARNING",
            message: `Event '${ev.eventType}' tại ${ev.atSec}s nằm ngoài khung cảnh ${sc.id} (duration: ${scDur}s).`,
            sceneId: sc.id,
          });
        }
        const isSelector = ev.targetElement.startsWith(".") || ev.targetElement.startsWith("#");
        if (!isSelector && !validElements.has(ev.targetElement)) {
          visualEventIssues.push({
            code: "UNKNOWN_DOM_TARGET",
            severity: "WARNING",
            message: `Target element '${ev.targetElement}' trong cảnh ${sc.id} không thuộc danh mục selector chuẩn.`,
            sceneId: sc.id,
          });
        }
      }
    }
  }
  addCheck("visualEvents", visualEventIssues);

  // 4. Check Text Overflow & Safe Area
  const textIssues: QcIssue[] = [];
  for (const sc of script.scenes) {
    const td = sc.templateData;
    if (td.template === "hook" && td.headline && td.headline.length > 90) {
      textIssues.push({
        code: "HEADING_TEXT_OVERFLOW",
        severity: "WARNING",
        message: `Tiêu đề hook cảnh ${sc.id} dài (${td.headline.length} ký tự). Cần auto-fit font size để tránh tràn khung.`,
        sceneId: sc.id,
      });
    }
    if (td.template === "stat-hero" && td.value && td.value.length > 18) {
      textIssues.push({
        code: "STAT_VALUE_TOO_LONG",
        severity: "WARNING",
        message: `Con số thống kê cảnh ${sc.id} (${td.value}) quá dài. Có nguy cơ vỡ layout metric hero.`,
        sceneId: sc.id,
      });
    }
    if (td.template === "callout" && td.statement && td.statement.length > 180) {
      textIssues.push({
        code: "CALLOUT_STATEMENT_OVERFLOW",
        severity: "WARNING",
        message: `Statement callout cảnh ${sc.id} dài (${td.statement.length} ký tự). Cần giới hạn dòng để bảo vệ safe-area.`,
        sceneId: sc.id,
      });
    }
  }
  addCheck("textOverflow", textIssues);

  // 5. Check Assets Existence
  const assetIssues: QcIssue[] = [];
  for (const sc of script.scenes) {
    if (sc.media?.src && !sc.media.src.startsWith("http") && !sc.media.src.startsWith("/api/")) {
      const fullPath = assetBasePath ? `${assetBasePath}/${sc.media.src}` : sc.media.src;
      if (!existsSync(fullPath)) {
        assetIssues.push({
          code: "MEDIA_ASSET_MISSING",
          severity: "WARNING",
          message: `Không tìm thấy file tư liệu cục bộ: ${sc.media.src} (cảnh ${sc.id}). Sẽ fallback sang background mặc định.`,
          sceneId: sc.id,
        });
      }
    }
  }
  addCheck("assets", assetIssues);

  // 6. Check Scene Diversity & Layout Repetition
  const diversityIssues: QcIssue[] = [];
  const divReport = evaluateSceneDiversity(script.scenes);
  if (divReport.consecutiveDuplicates.length > 0) {
    for (const dup of divReport.consecutiveDuplicates) {
      diversityIssues.push({
        code: "CONSECUTIVE_TEMPLATE_DUPLICATE",
        severity: "WARNING",
        message: `Template '${dup.template}' bị lặp liên tiếp ở các cảnh: ${dup.sceneIndices.map((i) => `#${i + 1}`).join(", ")}.`,
      });
    }
  }
  if (divReport.diversityScore < 50) {
    diversityIssues.push({
      code: "LOW_DIVERSITY_SCORE",
      severity: "WARNING",
      message: `Điểm đa dạng layout thấp (${divReport.diversityScore}/100). Video có thể bị đơn điệu.`,
    });
  }
  addCheck("diversity", diversityIssues);

  // 7. Check Factual Basis of Statistics
  const factIssues: QcIssue[] = [];
  for (const sc of script.scenes) {
    if (sc.templateData.template === "stat-hero") {
      const val = sc.templateData.value;
      const cleanVal = val.replace(/[^\d]/g, "");
      const text = sc.voiceText || "";
      if (cleanVal.length > 0 && !text.includes(cleanVal)) {
        factIssues.push({
          code: "HALLUCINATED_STATISTIC",
          severity: "WARNING",
          message: `Con số '${val}' trong template stat-hero (cảnh ${sc.id}) không xuất hiện trong lời đọc kịch bản. Cần xác minh nguồn thật.`,
          sceneId: sc.id,
        });
      }
    }
  }
  addCheck("factChecking", factIssues);

  // 8. Deterministic Seek Sweep (Check for voids/black frames at playhead points)
  const seekIssues: QcIssue[] = [];
  const rawTimeline = script.timeline as any;
  if (rawTimeline?.tracks) {
    const sceneTrack = rawTimeline.tracks.find((t: any) => t.type === "scene");
    if (sceneTrack && sceneTrack.clips.length > 0) {
      const samplePoints = [
        0.0,
        0.5,
        totalDurationSec * 0.25,
        totalDurationSec * 0.5,
        totalDurationSec * 0.75,
        Math.max(0, totalDurationSec - 0.1),
      ];

      for (const t of samplePoints) {
        const activeClips = sceneTrack.clips.filter((c: any) => t >= c.start && t < c.start + c.duration);
        if (activeClips.length === 0) {
          seekIssues.push({
            code: "BLACK_FRAME_AT_PLAYHEAD",
            severity: "BLOCKING",
            message: `Tại thời điểm ${t.toFixed(2)}s không có scene nào hoạt động. Màn hình sẽ bị đen.`,
          });
        } else if (activeClips.length > 1) {
          seekIssues.push({
            code: "MULTIPLE_ACTIVE_SCENES",
            severity: "BLOCKING",
            message: `Tại thời điểm ${t.toFixed(2)}s có ${activeClips.length} cảnh cùng hoạt động: ${activeClips.map((c: any) => c.id).join(", ")}.`,
          });
        }
      }
    }
  }
  addCheck("seekDeterminism", seekIssues);

  // 9. Check Asset Relevance (No avatars in body tech scenes, technical relevance)
  const relevanceIssues: QcIssue[] = [];
  for (let sIdx = 0; sIdx < script.scenes.length; sIdx++) {
    const sc = script.scenes[sIdx];
    const isBody = sc.type === "body";
    const src = sc.media?.src || (sc.templateData as any).mediaSrc || "";

    if (isBody && src) {
      const lowerSrc = src.toLowerCase();
      if (lowerSrc.includes("avatar") || lowerSrc.includes("owner") || sc.media?.presentation === "logo") {
        relevanceIssues.push({
          code: "IRRELEVANT_BODY_ASSET",
          severity: "BLOCKING",
          message: `Cảnh ${sc.id} (#${sIdx + 1}) sử dụng ảnh đại diện (avatar/logo) làm visual card chính. Nội dung kỹ thuật cần dùng diagram, screenshot hoặc typography layout.`,
          sceneId: sc.id,
        });
      }
    }

    if (sc.templateData.template === "visual-focus" && isBody) {
      if (!src || src.includes("avatar")) {
        relevanceIssues.push({
          code: "VISUAL_FOCUS_LACKS_TECHNICAL_ASSET",
          severity: "WARNING",
          message: `Cảnh visual-focus ${sc.id} không có asset kỹ thuật phù hợp. Cần chuyển sang step-by-step hoặc feature-list.`,
          sceneId: sc.id,
        });
      }
    }
  }
  addCheck("assetRelevance", relevanceIssues);

  // 10. Check Visual Dead Time (>5s without at least 2 visual beats)
  const deadTimeIssues: QcIssue[] = [];
  for (let sIdx = 0; sIdx < script.scenes.length; sIdx++) {
    const sc = script.scenes[sIdx];
    const timing = timelineScenes[sc.id];
    const scDur = timing?.duration ?? (boundaries[sIdx] ? boundaries[sIdx] - (sIdx > 0 ? boundaries[sIdx - 1] : 0) : 4.0);

    if (scDur > 5.0) {
      const beatCount = Array.isArray(sc.visualEvents) ? sc.visualEvents.length : 0;
      if (beatCount < 2) {
        deadTimeIssues.push({
          code: "VISUAL_DEAD_TIME",
          severity: "WARNING",
          message: `Cảnh ${sc.id} (#${sIdx + 1}) kéo dài ${scDur.toFixed(1)}s (>5s) nhưng chỉ có ${beatCount} visual beat. Cần thêm beat dựa trên SRT cue để duy trì sự chú ý.`,
          sceneId: sc.id,
        });
      }
    }
  }
  addCheck("visualDeadTime", deadTimeIssues);

  // 11. Check Composition & Safe Area Balance
  const compositionIssues: QcIssue[] = [];
  for (const sc of script.scenes) {
    const td = sc.templateData;
    if (td.template === "feature-list" && Array.isArray(td.bullets) && td.bullets.length > 4) {
      compositionIssues.push({
        code: "EXCESSIVE_LIST_ITEMS",
        severity: "WARNING",
        message: `Cảnh ${sc.id} có ${td.bullets.length} gạch đầu dòng. Có nguy cơ đẩy layout xuống đè vào vùng captions (y > 1400px).`,
        sceneId: sc.id,
      });
    }
    if (td.template === "step-by-step" && Array.isArray(td.steps) && td.steps.length > 3) {
      compositionIssues.push({
        code: "EXCESSIVE_STEPS",
        severity: "WARNING",
        message: `Cảnh ${sc.id} có ${td.steps.length} bước. Trên khung 1080x1920 chỉ nên hiển thị tối đa 3 bước để đảm bảo kích thước đọc.`,
        sceneId: sc.id,
      });
    }
  }
  addCheck("compositionBalance", compositionIssues);

  // Summary aggregation
  const blockingIssues = issues.filter((i) => i.severity === "BLOCKING");
  const warningIssues = issues.filter((i) => i.severity === "WARNING");

  const totalChecks = Object.keys(checkResults).length;
  const passedChecks = Object.values(checkResults).filter((c) => c.passed).length;

  const scorePenalty = blockingIssues.length * 25 + warningIssues.length * 5;
  // Cap automated compliance score at max 95 to remind that human aesthetic evaluation is required
  const score = Math.max(0, Math.min(95, 100 - scorePenalty));

  const humanReviewChecklist: HumanReviewItem[] = [
    {
      aspect: "Nhịp điệu thị giác (Visual Pacing)",
      question: "Các cảnh 8-11s có tạo cảm giác biến chuyển tự nhiên khi chuyển ý không?",
      guidance: "Kiểm tra xem visual beat có đổi trọng tâm đúng lúc giọng đọc nhấn mạnh từ khóa không.",
      status: "NEEDS_HUMAN_INSPECTION",
    },
    {
      aspect: "Độ sắc nét & khả năng đọc trên điện thoại (Mobile Readability)",
      question: "Ảnh chụp GitHub và biểu đồ có đọc được tiêu đề/nút bấm trên màn hình nhỏ không?",
      guidance: "Kiểm tra ở kích thước preview 360x640px hoặc thiết bị thật.",
      status: "NEEDS_HUMAN_INSPECTION",
    },
    {
      aspect: "Sự liên quan của tư liệu (Asset Relevance)",
      question: "Hình ảnh có minh họa đúng bản chất kỹ thuật của câu nói không?",
      guidance: "Không dùng ảnh tác giả hay icon chung chung thay cho dữ liệu kỹ thuật.",
      status: "NEEDS_HUMAN_INSPECTION",
    },
    {
      aspect: "An toàn vùng hiển thị (Safe Areas)",
      question: "Có chi tiết hay chữ nào bị thanh điều hướng TikTok/Reels đè lên không?",
      guidance: "Vùng an toàn chuẩn: top 180px, bottom 380px, hai bên 80px.",
      status: "NEEDS_HUMAN_INSPECTION",
    },
  ];

  return {
    passed: blockingIssues.length === 0,
    totalChecks,
    passedChecks,
    blockingCount: blockingIssues.length,
    warningCount: warningIssues.length,
    blockingErrors: blockingIssues.map((i) => i.message),
    warnings: warningIssues.map((i) => i.message),
    checks: checkResults,
    score,
    evaluatedAt: new Date().toISOString(),
    humanReviewChecklist,
    aestheticNotice: "Điểm QC phản ánh độ tuân thủ kỹ thuật tự động (0-95). Chất lượng cảm thụ thẩm mỹ cần được con người nghiệm thu trực tiếp trên video thành phẩm.",
  };
}
