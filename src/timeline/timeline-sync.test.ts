import { describe, it, expect } from "vitest";
import { buildCanonicalTimelineFromSrt } from "./builder.js";
import { composeHtml } from "../render/html-composer.js";
import { ScriptSchema, type Script } from "../render/script-schema.js";

describe("Phase 1: Canonical Timeline Integration & Seek Consistency", () => {
  const sampleScript: Script = {
    schemaVersion: 2,
    version: "2.0",
    directingMode: "auto",
    templatePack: "reference",
    visualStyle: "tech-editorial",
    motionPreset: "explanatory",
    soundDesign: true,
    metadata: {
      title: "Kronos Tech Video",
      source: { url: "https://github.com/shiyu-coder/Kronos", domain: "github.com", image: null },
      channel: "DevPeek36",
    },
    voice: {
      provider: "imported",
      voiceId: "imported-voice",
      speed: 1.0,
      sceneBoundaries: [4.44, 8.9, 16.5],
    },
    captions: { enabled: true, style: "tiktok-bold", highlightMode: "accurate-only" },
    scenes: [
      {
        id: "scene-1",
        type: "hook",
        voiceText: "AI không chỉ biết viết code. Giờ nó còn học cách đọc biểu đồ giá Bitcoin.",
        semanticIntent: "hook",
        motionPreset: "energetic",
        motionIntensity: "high",
        cueRange: { startCueId: 1, endCueId: 2 },
        visualEvents: [
          { targetCueId: 1, eventType: "reveal", targetElement: "heading", timingSource: "cue-start" },
          { targetCueId: 2, eventType: "shimmer", targetElement: "badge", timingSource: "cue-start" },
        ],
        templateData: { template: "hook", headline: "AI ĐỌC BIỂU ĐỒ BITCOIN?", kenBurns: "zoom-in" },
      },
      {
        id: "scene-2",
        type: "body",
        voiceText: "Và đây là một dự án mã nguồn mở thú vị. Nó tên là Kronos.",
        semanticIntent: "explanation",
        motionPreset: "explanatory",
        motionIntensity: "medium",
        cueRange: { startCueId: 3, endCueId: 4 },
        templateData: { template: "callout", statement: "KRONOS AI", tag: "MÃ NGUỒN MỞ" },
      },
      {
        id: "scene-3",
        type: "body",
        voiceText: "Mô hình được huấn luyện trên 45 sàn giao dịch toàn cầu.",
        semanticIntent: "statistic",
        motionPreset: "energetic",
        motionIntensity: "high",
        cueRange: { startCueId: 5, endCueId: 6 },
        visualEvents: [
          { targetCueId: 5, eventType: "pulse", targetElement: "metric", timingSource: "cue-start" },
        ],
        templateData: { template: "stat-hero", value: "45+", label: "45+ SÀN GIAO DỊCH" },
      },
      {
        id: "scene-4",
        type: "outro",
        voiceText: "Khám phá ngay repo này trên GitHub.",
        semanticIntent: "cta",
        motionPreset: "dramatic",
        motionIntensity: "medium",
        cueRange: { startCueId: 7, endCueId: 7 },
        templateData: { template: "outro", ctaTop: "Khám phá repo ngay", channelName: "DevPeek36", source: "github.com" },
      },
    ],
  };

  const sampleCues = [
    { id: 1, startSec: 0.0, endSec: 1.54, text: "AI không chỉ biết viết code." },
    { id: 2, startSec: 2.08, endSec: 4.44, text: "Giờ nó còn học cách đọc biểu đồ giá Bitcoin." },
    { id: 3, startSec: 5.07, endSec: 7.3, text: "Và đây là một dự án mã nguồn mở thú vị." },
    { id: 4, startSec: 7.78, endSec: 8.9, text: "Nó tên là Kronos." },
    { id: 5, startSec: 9.25, endSec: 12.43, text: "Mô hình được huấn luyện trên 45 sàn giao dịch toàn cầu." },
    { id: 6, startSec: 13.0, endSec: 16.5, text: "Khi nhìn biểu đồ nến, ta thấy giá mở cửa, đóng cửa." },
    { id: 7, startSec: 17.0, endSec: 19.2, text: "Khám phá ngay repo này trên GitHub." },
  ];

  const totalDuration = 20.0;

  it("builds a canonical TimelineState where scenes, voice, captions, and events align strictly", () => {
    const timelineState = buildCanonicalTimelineFromSrt(sampleScript, sampleCues, totalDuration);

    expect(timelineState.totalDuration).toBe(20.0);
    expect(timelineState.tracks.length).toBe(5); // scenes, voice, captions, events, bgm

    const scenesTrack = timelineState.tracks.find((t) => t.type === "scene");
    const voiceTrack = timelineState.tracks.find((t) => t.type === "voice");
    const captionsTrack = timelineState.tracks.find((t) => t.type === "caption");
    const eventsTrack = timelineState.tracks.find((t) => t.type === "event");

    expect(scenesTrack).toBeDefined();
    expect(voiceTrack).toBeDefined();
    expect(captionsTrack).toBeDefined();
    expect(eventsTrack).toBeDefined();

    expect(scenesTrack!.clips.length).toBe(4);
    expect(captionsTrack!.clips.length).toBe(7);
    expect(eventsTrack!.clips.length).toBe(3);

    // Scene 1: starts at 0, ends at 4.44
    expect(scenesTrack!.clips[0].start).toBe(0);
    expect(scenesTrack!.clips[0].duration).toBe(4.44);

    // Scene 2: starts at 4.44, ends at 8.9 (duration = 4.46)
    expect(scenesTrack!.clips[1].start).toBe(4.44);
    expect(scenesTrack!.clips[1].duration).toBe(4.46);

    // Scene 3: starts at 8.9, ends at 16.5 (duration = 7.6)
    expect(scenesTrack!.clips[2].start).toBe(8.9);
    expect(scenesTrack!.clips[2].duration).toBe(7.6);

    // Scene 4: starts at 16.5, ends at 20.0 (duration = 3.5)
    expect(scenesTrack!.clips[3].start).toBe(16.5);
    expect(scenesTrack!.clips[3].duration).toBe(3.5);

    // Event 1 (targetCueId: 1, cue-start) starts at 0.0
    expect(eventsTrack!.clips[0].start).toBe(0.0);
    expect(eventsTrack!.clips[0].name).toContain("reveal on heading");

    // Event 2 (targetCueId: 2, cue-start) starts at 2.08 (exact cue 2 start)
    expect(eventsTrack!.clips[1].start).toBe(2.08);
    expect(eventsTrack!.clips[1].name).toContain("shimmer on badge");

    // Event 3 (targetCueId: 5, cue-start) starts at 9.25 (exact cue 5 start)
    expect(eventsTrack!.clips[2].start).toBe(9.25);
    expect(eventsTrack!.clips[2].name).toContain("pulse on metric");
  });

  it("guarantees deterministic seek consistency at any frame timestamp", () => {
    const timelineState = buildCanonicalTimelineFromSrt(sampleScript, sampleCues, totalDuration);
    const scenesTrack = timelineState.tracks.find((t) => t.type === "scene")!;

    // Test a sweep of sample timestamps across the 20s duration
    const testPoints = [0.0, 1.5, 4.43, 4.45, 7.0, 8.89, 8.91, 12.0, 16.49, 16.51, 19.99];

    for (const t of testPoints) {
      // Exactly ONE scene must be active at any given playhead timestamp t
      const activeScenes = scenesTrack.clips.filter((c) => t >= c.start && t < c.start + c.duration);
      expect(activeScenes.length).toBe(1);
    }
  });

  it("synchronizes seamlessly with composeHtml for HyperFrames rendering", () => {
    const timelineState = buildCanonicalTimelineFromSrt(sampleScript, sampleCues, totalDuration);
    const scriptWithTimeline = timelineState.script;

    const sceneAudio = scriptWithTimeline.scenes.map((s) => {
      const timing = scriptWithTimeline.timeline?.scenes?.[s.id];
      return { id: s.id, durationSec: timing?.duration ?? 3.0 };
    });

    const captionCues = sampleCues.map((c) => ({
      ...c,
      startMs: Math.round(c.startSec * 1000),
      endMs: Math.round(c.endSec * 1000),
      words: [],
      accuracy: "low" as const,
    }));

    const html = composeHtml({
      script: scriptWithTimeline,
      sceneAudio,
      gapSec: 0,
      outroHoldSec: 0,
      bgImageRelPath: null,
      audioRelPath: "voice.mp3",
      captionCues,
    });

    // Check that scene data-start and data-duration in HTML strictly match canonical timeline
    expect(html).toContain('data-start="0.00" data-duration="4.44"');
    expect(html).toContain('data-start="4.44" data-duration="4.46"');
    expect(html).toContain('data-start="8.90" data-duration="7.60"');
    expect(html).toContain('data-start="16.50" data-duration="3.50"');

    // Check caption cues are embedded with exact timestamps (3 decimal places)
    expect(html).toContain('data-start="0.000" data-duration="1.540"');
    expect(html).toContain('data-start="2.080" data-duration="2.360"');
    expect(html).toContain('data-start="9.250" data-duration="3.180"');

    // Master timeline container is intact for HyperFrames
    expect(html).toContain('id="stage"');
  });
});
