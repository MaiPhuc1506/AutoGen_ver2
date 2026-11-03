import { describe, it, expect } from "vitest";
import { runPreRenderQc } from "./qc-engine.js";
import type { Script } from "../render/script-schema.js";
import type { CaptionCue } from "../captions/types.js";

describe("Quality Control Engine (QC Engine)", () => {
  const validScript: Script = {
    schemaVersion: 2,
    version: "2.0",
    directingMode: "auto",
    templatePack: "reference",
    visualStyle: "tech-editorial",
    motionPreset: "explanatory",
    soundDesign: true,
    metadata: {
      title: "Test Repo Video",
      source: { url: "https://github.com/test/repo", domain: "github.com", image: null },
      channel: "DevPeek36",
    },
    voice: {
      provider: "imported",
      voiceId: "imported-voice",
      speed: 1.0,
      sceneBoundaries: [5.0, 10.0],
    },
    captions: { enabled: true, style: "tiktok-bold", highlightMode: "accurate-only" },
    scenes: [
      {
        id: "scene-1",
        type: "hook",
        voiceText: "Khám phá dự án mã nguồn mở cực hay.",
        semanticIntent: "hook",
        cueRange: { startCueId: 1, endCueId: 2 },
        templateData: { template: "hook", headline: "DỰ ÁN MÃ NGUỒN MỞ", kenBurns: "zoom-in" },
      },
      {
        id: "scene-2",
        type: "body",
        voiceText: "Mô hình được huấn luyện với hơn 50 sàn giao dịch.",
        semanticIntent: "statistic",
        cueRange: { startCueId: 3, endCueId: 4 },
        templateData: { template: "stat-hero", value: "50+", label: "50+ SÀN GIAO DỊCH" },
      },
      {
        id: "scene-3",
        type: "outro",
        voiceText: "Theo dõi kênh để đón xem thêm nhiều video hay.",
        semanticIntent: "cta",
        cueRange: { startCueId: 5, endCueId: 5 },
        templateData: { template: "outro", ctaTop: "Khám phá ngay", channelName: "DevPeek36", source: "github.com" },
      },
    ],
  };

  const validCues: CaptionCue[] = [
    { id: 1, startSec: 0.0, endSec: 2.5, startMs: 0, endMs: 2500, text: "Khám phá dự án", words: [] },
    { id: 2, startSec: 2.5, endSec: 5.0, startMs: 2500, endMs: 5000, text: "mã nguồn mở cực hay.", words: [] },
    { id: 3, startSec: 5.0, endSec: 7.5, startMs: 5000, endMs: 7500, text: "Mô hình được huấn luyện", words: [] },
    { id: 4, startSec: 7.5, endSec: 10.0, startMs: 7500, endMs: 10000, text: "với hơn 50 sàn giao dịch.", words: [] },
    { id: 5, startSec: 10.0, endSec: 13.0, startMs: 10000, endMs: 13000, text: "Theo dõi kênh để đón xem.", words: [] },
  ];

  it("passes a clean, contiguous script with 100% score", () => {
    const report = runPreRenderQc({
      script: validScript,
      totalDurationSec: 13.0,
      cues: validCues,
    });

    expect(report.passed).toBe(true);
    expect(report.blockingCount).toBe(0);
    expect(report.score).toBeGreaterThanOrEqual(95);
  });

  it("blocks rendering when there is a scene gap (void screen)", () => {
    const brokenScript = JSON.parse(JSON.stringify(validScript)) as Script;
    // Inject a gap into timeline: scene 1 ends at 4.0, scene 2 starts at 5.5
    (brokenScript as any).timeline = {
      totalDuration: 13.0,
      fps: 30,
      tracks: [],
      scenes: {
        "scene-1": { start: 0, duration: 4.0 },
        "scene-2": { start: 5.5, duration: 4.5 }, // 1.5s gap!
        "scene-3": { start: 10.0, duration: 3.0 },
      },
    };

    const report = runPreRenderQc({
      script: brokenScript,
      totalDurationSec: 13.0,
      cues: validCues,
    });

    expect(report.passed).toBe(false);
    expect(report.blockingCount).toBeGreaterThan(0);
    expect(report.blockingErrors.some((e) => e.includes("gap") || e.includes("Khoảng trống"))).toBe(true);
  });

  it("blocks rendering when there is a scene overlap", () => {
    const brokenScript = JSON.parse(JSON.stringify(validScript)) as Script;
    (brokenScript as any).timeline = {
      totalDuration: 13.0,
      fps: 30,
      tracks: [],
      scenes: {
        "scene-1": { start: 0, duration: 6.0 }, // ends at 6.0
        "scene-2": { start: 4.5, duration: 5.0 }, // starts at 4.5 -> 1.5s overlap!
        "scene-3": { start: 9.5, duration: 3.5 },
      },
    };

    const report = runPreRenderQc({
      script: brokenScript,
      totalDurationSec: 13.0,
      cues: validCues,
    });

    expect(report.passed).toBe(false);
    expect(report.blockingErrors.some((e) => e.includes("overlap") || e.includes("Chồng lấn"))).toBe(true);
  });

  it("warns when stat-hero contains numbers hallucinated / not in transcript", () => {
    const hallucinatedScript = JSON.parse(JSON.stringify(validScript)) as Script;
    // Scene 2 text does not contain 999
    (hallucinatedScript.scenes[1].templateData as any).value = "999+";

    const report = runPreRenderQc({
      script: hallucinatedScript,
      totalDurationSec: 13.0,
      cues: validCues,
    });

    expect(report.warnings.some((w) => w.includes("999+") || w.includes("không xuất hiện"))).toBe(true);
  });

  it("detects black frames during deterministic seek check", () => {
    const scriptWithVoid = JSON.parse(JSON.stringify(validScript)) as Script;
    (scriptWithVoid as any).timeline = {
      totalDuration: 13.0,
      fps: 30,
      tracks: [
        {
          id: "track-scenes",
          type: "scene",
          label: "Scenes",
          clips: [
            { id: "c1", trackId: "track-scenes", trackType: "scene", sceneId: "scene-1", start: 0, duration: 2.0, name: "Scene 1" },
            // Void from 2.0 to 7.0!
            { id: "c2", trackId: "track-scenes", trackType: "scene", sceneId: "scene-2", start: 7.0, duration: 6.0, name: "Scene 2" },
          ],
        },
      ],
      scenes: {},
    };

    const report = runPreRenderQc({
      script: scriptWithVoid,
      totalDurationSec: 13.0,
      cues: validCues,
    });

    expect(report.passed).toBe(false);
    expect(report.blockingErrors.some((e) => e.includes("không có scene nào hoạt động") || e.includes("Màn hình sẽ bị đen"))).toBe(true);
  });
});
