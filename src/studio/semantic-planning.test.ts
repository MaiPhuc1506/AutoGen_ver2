import { describe, it, expect } from "vitest";
import {
  repairAndNormalizeLlmPlan,
  validateVisualPlan,
  planCreativeVisuals,
} from "./creative-planner.js";
import {
  evaluateSceneDiversity,
  optimizeSceneDiversity,
} from "./diversity.js";
import { Scene, SceneType, MotionPresetSchema, VisualEventSchema } from "../render/script-schema.js";
import type { CaptionCue } from "../captions/types.js";

describe("Phase 1: Semantic Scene Planning, Diversity Scoring & Motion Schema", () => {
  const dummyTranscript = "Chào mừng bạn đến với Kronos. Mô hình AI này dự báo biểu đồ tài chính. Nó được huấn luyện trên 45 sàn giao dịch. Thử nghiệm cho kết quả vượt trội so với các phương pháp cũ. Nhưng thị trường thực tế vẫn tiềm ẩn rủi ro nhiễu cao. Khám phá repo ngay trên GitHub.";

  const sampleCues: CaptionCue[] = [
    { id: 1, startMs: 0, endMs: 2000, startSec: 0, endSec: 2, text: "Chào mừng bạn đến với Kronos.", words: [] },
    { id: 2, startMs: 2000, endMs: 5000, startSec: 2, endSec: 5, text: "Mô hình AI này dự báo biểu đồ tài chính.", words: [] },
    { id: 3, startMs: 5000, endMs: 8000, startSec: 5, endSec: 8, text: "Nó được huấn luyện trên 45 sàn giao dịch.", words: [] },
    { id: 4, startMs: 8000, endMs: 12000, startSec: 8, endSec: 12, text: "Thử nghiệm cho kết quả vượt trội so với các phương pháp cũ.", words: [] },
    { id: 5, startMs: 12000, endMs: 16000, startSec: 12, endSec: 16, text: "Nhưng thị trường thực tế vẫn tiềm ẩn rủi ro nhiễu cao.", words: [] },
    { id: 6, startMs: 16000, endMs: 19000, startSec: 16, endSec: 19, text: "Khám phá repo ngay trên GitHub.", words: [] },
  ];

  it("normalizes semanticIntent and guards against hallucinated stats", () => {
    const rawScenesWithHallucinatedStat = [
      {
        id: "scene-1",
        type: "hook",
        voiceText: "Chào mừng bạn đến với Kronos. Mô hình AI này dự báo biểu đồ tài chính.",
        templateData: { template: "hook", headline: "KRONOS AI" },
      },
      {
        id: "scene-2",
        type: "body",
        // Text has NO numbers at all, but LLM invented a stat-hero template!
        voiceText: "Mô hình này hoạt động rất mượt mà và ổn định.",
        templateData: { template: "stat-hero", value: "99%", label: "ĐỘ CHÍNH XÁC" },
      },
      {
        id: "scene-3",
        type: "body",
        // Text DOES have a real number: "45 sàn giao dịch"
        voiceText: "Nó được huấn luyện trên 45 sàn giao dịch toàn cầu.",
        templateData: { template: "stat-hero", value: "45+", label: "45+ SÀN GIAO DỊCH" },
      },
      {
        id: "scene-4",
        type: "outro",
        voiceText: "Khám phá repo ngay trên GitHub.",
        templateData: { template: "outro", ctaTop: "Khám phá ngay", channelName: "DevPeek36", source: "GitHub" },
      },
    ];

    const repaired = repairAndNormalizeLlmPlan(
      rawScenesWithHallucinatedStat,
      [],
      rawScenesWithHallucinatedStat.map((s) => s.voiceText).join(" ")
    );

    // Scene 1: hook
    expect(repaired[0].semanticIntent).toBe("hook");

    // Scene 2: hallucinated stat was demoted to callout and semanticIntent to explanation
    expect(repaired[1].templateData.template).toBe("callout");
    expect(repaired[1].semanticIntent).toBe("explanation");

    // Scene 3: real stat is preserved
    expect(repaired[2].templateData.template).toBe("stat-hero");
    expect(repaired[2].semanticIntent).toBe("statistic");

    // Scene 4: outro -> cta
    expect(repaired[3].semanticIntent).toBe("cta");
  });

  it("evaluates diversity score and detects consecutive template repetitions", () => {
    const repetitiveScenes: any[] = [
      { id: "scene-1", type: "hook", templateData: { template: "hook", headline: "HOOK" }, voiceText: "Hook" },
      { id: "scene-2", type: "body", templateData: { template: "callout", statement: "Callout 1" }, voiceText: "Text 1" },
      { id: "scene-3", type: "body", templateData: { template: "callout", statement: "Callout 2" }, voiceText: "Text 2" },
      { id: "scene-4", type: "body", templateData: { template: "callout", statement: "Callout 3" }, voiceText: "Text 3" },
      { id: "scene-5", type: "outro", templateData: { template: "outro", ctaTop: "Outro" }, voiceText: "Outro" },
    ];

    const report = evaluateSceneDiversity(repetitiveScenes);

    expect(report.isDiverse).toBe(false);
    expect(report.diversityScore).toBeLessThan(60);
    expect(report.consecutiveDuplicates.length).toBe(1);
    expect(report.consecutiveDuplicates[0].template).toBe("callout");
    expect(report.consecutiveDuplicates[0].sceneIndices).toEqual([1, 2, 3]);
    expect(report.warnings.some((w) => w.includes("lặp layout liên tiếp"))).toBe(true);
  });

  it("auto-diversifies consecutive duplicates when scene content has semantic evidence", () => {
    const scenesWithHiddenEvidence: any[] = [
      { id: "scene-1", type: "hook", templateData: { template: "hook", headline: "HOOK" }, voiceText: "Intro" },
      { id: "scene-2", type: "body", templateData: { template: "callout", statement: "CALLOUT" }, voiceText: "Giới thiệu cơ chế" },
      {
        id: "scene-3",
        type: "body",
        templateData: { template: "callout", statement: "CALLOUT 2" },
        voiceText: "Huấn luyện trên 45 sàn giao dịch tiền tệ toàn cầu.", // Has number 45 -> diversified to stat-hero
      },
      {
        id: "scene-4",
        type: "body",
        templateData: { template: "stat-hero", value: "45+", label: "STAT" },
        voiceText: "So với các thuật toán cũ, phương pháp mới hiệu quả hơn nhiều.", // Duplicates stat-hero -> diversified to comparison
      },
      { id: "scene-5", type: "outro", templateData: { template: "outro", ctaTop: "OUTRO" }, voiceText: "Outro" },
    ];

    const { scenes: optimized, report } = optimizeSceneDiversity(scenesWithHiddenEvidence);

    // Scene 3 should be auto-diversified from callout to stat-hero
    expect(optimized[2].templateData.template).toBe("stat-hero");
    expect(optimized[2].semanticIntent).toBe("statistic");

    // Scene 4 should be auto-diversified from duplicate stat-hero to comparison
    expect(optimized[3].templateData.template).toBe("comparison");
    expect(optimized[3].semanticIntent).toBe("comparison");

    // New diversity score should be improved and no consecutive duplicates remain
    expect(report.consecutiveDuplicates.length).toBe(0);
    expect(report.diversityScore).toBeGreaterThanOrEqual(70);
  });

  it("does not force diversification if content is genuinely homogeneous", () => {
    const pureHomogeneousScenes: any[] = [
      { id: "scene-1", type: "hook", templateData: { template: "hook", headline: "HOOK" }, voiceText: "Hook" },
      { id: "scene-2", type: "body", templateData: { template: "callout", statement: "CALLOUT 1" }, voiceText: "Một góc nhìn triết học." },
      { id: "scene-3", type: "body", templateData: { template: "callout", statement: "CALLOUT 2" }, voiceText: "Một suy ngẫm sâu xa về cuộc sống." },
      { id: "scene-4", type: "outro", templateData: { template: "outro", ctaTop: "OUTRO" }, voiceText: "Outro" },
    ];

    const { scenes, report } = optimizeSceneDiversity(pureHomogeneousScenes);

    // Template remains callout to preserve authenticity (no fake stats or fake comparison)
    expect(scenes[1].templateData.template).toBe("callout");
    expect(scenes[2].templateData.template).toBe("callout");
    expect(report.recommendations.some((r) => r.includes("Nội dung không đủ đa dạng"))).toBe(true);
  });

  it("validates motion preset, intensity, and visual events schema strictly", () => {
    const validSceneInput = {
      id: "scene-1",
      type: "hook",
      voiceText: "Chào mừng bạn đến với thế giới AI.",
      semanticIntent: "hook",
      motionPreset: "energetic",
      motionIntensity: "high",
      visualEvents: [
        {
          id: "ev-1",
          targetCueId: 1,
          eventType: "reveal",
          targetElement: "heading",
          timingSource: "cue-start",
        },
        {
          id: "ev-2",
          targetCueId: 1,
          eventType: "shimmer",
          targetElement: "badge",
          timingSource: "cue-middle",
        },
      ],
      templateData: {
        template: "hook",
        headline: "THẾ GIỚI AI",
      },
    };

    // Scene Zod schema parses correctly
    const parsed = Scene.parse(validSceneInput);
    expect(parsed.motionPreset).toBe("energetic");
    expect(parsed.motionIntensity).toBe("high");
    expect(parsed.visualEvents?.length).toBe(2);
    expect(parsed.visualEvents?.[0].eventType).toBe("reveal");

    // Invalid motion preset is rejected by Zod
    expect(() =>
      Scene.parse({
        ...validSceneInput,
        motionPreset: "unsupported-preset-123",
      })
    ).toThrow();

    // Arbitrary JS code inside visual events is stripped by repairAndNormalizeLlmPlan
    const rawMaliciousInput = [
      {
        ...validSceneInput,
        visualEvents: [
          {
            targetCueId: 1,
            eventType: "reveal",
            targetElement: "heading",
            timingSource: "cue-start",
            customCode: "alert('xss')",
            fn: "() => { window.hack = true }",
          },
          {
            targetCueId: 1,
            eventType: "invalid-event-type", // invalid event type
            targetElement: "heading",
            timingSource: "cue-start",
          },
        ],
      },
      {
        id: "scene-2",
        type: "outro",
        voiceText: "Tạm biệt.",
        templateData: { template: "outro", ctaTop: "Follow", channelName: "DevPeek36", source: "GitHub" },
      },
    ];

    const repaired = repairAndNormalizeLlmPlan(rawMaliciousInput, [], "Chào mừng bạn đến với thế giới AI. Tạm biệt.");
    expect(repaired[0].visualEvents.length).toBe(1); // invalid event discarded
    expect(repaired[0].visualEvents[0].customCode).toBeUndefined(); // arbitrary fields stripped
    expect(repaired[0].visualEvents[0].fn).toBeUndefined();
  });
});
