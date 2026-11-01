import { describe, it, expect, vi } from "vitest";
import {
  calculateTextOverlap,
  mapScenesToAudioTimestamps,
  alignCreativeAudioAndSubtitles,
  normalizeText,
  distributeSentencesAcoustically,
  validateTimelineSanity,
} from "./audio-aligner.js";
import type { CaptionCue } from "./types.js";

describe("Creative Mode - Audio & Subtitle Alignment", () => {
  it("calculates text overlap similarity accurately", () => {
    const textA = "Đây là công cụ sinh video tự động từ GitHub";
    const textB = "Đây là công cụ tạo video tự động từ GitHub";
    const textC = "Một chủ đề hoàn toàn khác không liên quan";

    const overlapAB = calculateTextOverlap(textA, textB);
    const overlapAC = calculateTextOverlap(textA, textC);

    expect(overlapAB).toBeGreaterThan(0.6);
    expect(overlapAC).toBeLessThan(0.1);
  });

  it("maps scene texts to monotonically increasing audio timestamps", () => {
    const sceneTexts = [
      "Câu mở đầu giới thiệu công cụ mới.",
      "Tính năng thứ nhất là chuyển đổi mã nguồn thành video.",
      "Tính năng thứ hai là đồng bộ giọng đọc tự động.",
      "Hãy theo dõi kênh để cập nhật.",
    ];

    const cues: CaptionCue[] = [
      { id: 1, startMs: 0, endMs: 3000, startSec: 0, endSec: 3, text: "Câu mở đầu giới thiệu công cụ mới.", words: [], accuracy: "low" },
      { id: 2, startMs: 3000, endMs: 8000, startSec: 3, endSec: 8, text: "Tính năng thứ nhất là chuyển đổi mã nguồn thành video.", words: [], accuracy: "low" },
      { id: 3, startMs: 8000, endMs: 14000, startSec: 8, endSec: 14, text: "Tính năng thứ hai là đồng bộ giọng đọc tự động.", words: [], accuracy: "low" },
      { id: 4, startMs: 14000, endMs: 18000, startSec: 14, endSec: 18, text: "Hãy theo dõi kênh để cập nhật.", words: [], accuracy: "low" },
    ];

    const totalDur = 18.0;
    const boundaries = mapScenesToAudioTimestamps(sceneTexts, cues, totalDur);

    expect(boundaries.length).toBe(sceneTexts.length - 1);
    for (let i = 0; i < boundaries.length; i++) {
      expect(boundaries[i]).toBeGreaterThan(0);
      expect(boundaries[i]).toBeLessThan(totalDur);
      if (i > 0) {
        expect(boundaries[i]).toBeGreaterThan(boundaries[i - 1]);
      }
    }
  });

  it("handles alignment when SRT is provided and checks for mismatch", async () => {
    const srt = `1
00:00:00,500 --> 00:00:03,000
Chào mừng bạn đến với công cụ tạo video

2
00:00:03,200 --> 00:00:07,500
Tự động dựng toàn bộ phân cảnh từ GitHub
`;

    const transcript = "Chào mừng bạn đến với công cụ tạo video. Tự động dựng toàn bộ phân cảnh từ GitHub.";
    const sceneTexts = [
      "Chào mừng bạn đến với công cụ tạo video.",
      "Tự động dựng toàn bộ phân cảnh từ GitHub.",
    ];

    const res = await alignCreativeAudioAndSubtitles({
      audioPath: "dummy.mp3",
      totalDurationSec: 8.0,
      transcript,
      sceneTexts,
      srtContent: srt,
    });

    expect(res.cues.length).toBe(2);
    expect(res.timingQuality.source).toBe("imported-srt");
    expect(res.timingQuality.wordAccuracy).toBe("low");
    expect(res.timingQuality.cueAccuracy).toBe("verified");
    expect(res.highlightMode).toBe("estimated");
    expect(res.timingQuality.mismatchWarning).toBeUndefined();
  });

  it("warns when transcript diverges from SRT content", async () => {
    const srt = `1
00:00:00,500 --> 00:00:03,000
Nội dung phụ đề tiếng Anh Hello world

2
00:00:03,200 --> 00:00:06,000
This is completely different subtitle content
`;

    const transcript = "Kịch bản tiếng Việt hoàn toàn khác không hề khớp với file phụ đề.";
    const sceneTexts = [transcript];

    const res = await alignCreativeAudioAndSubtitles({
      audioPath: "dummy.mp3",
      totalDurationSec: 7.0,
      transcript,
      sceneTexts,
      srtContent: srt,
    });

    expect(res.timingQuality.mismatchWarning).toBeDefined();
    expect(res.timingQuality.mismatchWarning).toContain("Cảnh báo");
  });

  it("distributes sentences across all speech segments to cover the entire audio duration", () => {
    const sentences = [
      "Câu 1 mở đầu.",
      "Câu 2 giới thiệu.",
      "Câu 3 phân tích.",
      "Câu 4 tính năng.",
      "Câu 5 kết thúc.",
    ];

    // Simulate 10 speech segments spanning 0 to 50 seconds
    const segments = [
      { startSec: 0.0, endSec: 4.5 },
      { startSec: 5.0, endSec: 9.5 },
      { startSec: 10.0, endSec: 14.5 },
      { startSec: 15.0, endSec: 19.5 },
      { startSec: 20.0, endSec: 24.5 },
      { startSec: 25.0, endSec: 29.5 },
      { startSec: 30.0, endSec: 34.5 },
      { startSec: 35.0, endSec: 39.5 },
      { startSec: 40.0, endSec: 44.5 },
      { startSec: 45.0, endSec: 49.8 },
    ];

    const totalDur = 50.0;
    const cues = distributeSentencesAcoustically(sentences, segments, totalDur);

    expect(cues.length).toBe(sentences.length);
    // First cue starts at 0
    expect(cues[0].startSec).toBe(0.0);
    // Last cue finishes at the end of speech, not halfway!
    expect(cues[cues.length - 1].endSec).toBeGreaterThan(45.0);
    expect(cues[cues.length - 1].endSec).toBeLessThanOrEqual(totalDur);

    // Cues must be monotonically increasing
    for (let i = 1; i < cues.length; i++) {
      expect(cues[i].startSec).toBeGreaterThanOrEqual(cues[i - 1].startSec);
      expect(cues[i].endSec).toBeGreaterThan(cues[i].startSec);
    }
  });

  it("aligns sentence boundaries directly to acoustic pauses with a subtle visual lead-in", () => {
    const sentences = [
      "Câu thứ nhất giới thiệu dự án.",
      "Câu thứ hai nêu tính năng nổi bật.",
      "Câu thứ ba kết luận video.",
    ];

    // Three distinct speech blocks separated by ~0.5s pauses
    const segments = [
      { startSec: 0.0, endSec: 2.0 },
      { startSec: 2.5, endSec: 5.0 },
      { startSec: 5.6, endSec: 8.0 },
    ];

    const cues = distributeSentencesAcoustically(sentences, segments, 8.5);
    expect(cues.length).toBe(3);

    // Cue 1 starts at 0
    expect(cues[0].startSec).toBe(0.0);
    // Cue 2 starts right as segment 2 starts (with 60ms visual lead-in: 2.5 - 0.06 = 2.44)
    expect(cues[1].startSec).toBeCloseTo(2.44, 1);
    // Cue 3 starts right as segment 3 starts (with 60ms visual lead-in: 5.6 - 0.06 = 5.54)
    expect(cues[2].startSec).toBeCloseTo(5.54, 1);
  });

  it("anchors outro scene to the end of the video and prevents early outro triggers", () => {
    const sceneTexts = [
      "AI không chỉ biết viết code. Giờ nó còn học cách đọc biểu đồ giá Bitcoin.",
      "Và đây là một dự án mã nguồn mở khá thú vị.",
      "Theo nhóm phát triển, mô hình được huấn luyện trên dữ liệu 45 sàn.",
      "Kronos sử dụng một bộ tokenizer chuyên biệt.",
      "Sau đó mô hình Transformer học các chuỗi token.",
      "Bạn có thể mở ra để xem kết quả trực quan.",
      "Nhưng đừng nhầm dự báo với khả năng kiếm tiền.",
      "Nếu bạn đang học AI, Kronos là một repo đáng khám phá. Link GitHub ở mô tả.",
    ];

    // Cues spanning across 76.4 seconds
    const cues: CaptionCue[] = [
      { id: 1, startMs: 0, endMs: 5000, startSec: 0, endSec: 5, text: sceneTexts[0], words: [], accuracy: "low" },
      { id: 2, startMs: 5000, endMs: 14000, startSec: 5, endSec: 14, text: sceneTexts[1], words: [], accuracy: "low" },
      { id: 3, startMs: 14000, endMs: 25000, startSec: 14, endSec: 25, text: sceneTexts[2], words: [], accuracy: "low" },
      { id: 4, startMs: 25000, endMs: 38000, startSec: 25, endSec: 38, text: sceneTexts[3], words: [], accuracy: "low" },
      { id: 5, startMs: 38000, endMs: 49000, startSec: 38, endSec: 49, text: sceneTexts[4], words: [], accuracy: "low" },
      { id: 6, startMs: 49000, endMs: 60000, startSec: 49, endSec: 60, text: sceneTexts[5], words: [], accuracy: "low" },
      { id: 7, startMs: 60000, endMs: 70000, startSec: 60, endSec: 70, text: sceneTexts[6], words: [], accuracy: "low" },
      { id: 8, startMs: 70000, endMs: 76400, startSec: 70, endSec: 76.4, text: sceneTexts[7], words: [], accuracy: "low" },
    ];

    const totalDur = 76.4;
    const boundaries = mapScenesToAudioTimestamps(sceneTexts, cues, totalDur);

    expect(boundaries.length).toBe(7);
    // The last boundary (into Outro) must be near the end of video, NOT at 32 seconds!
    const outroStart = boundaries[boundaries.length - 1];
    expect(outroStart).toBeGreaterThan(65.0);
    expect(totalDur - outroStart).toBeLessThanOrEqual(10.0);
    expect(totalDur - outroStart).toBeGreaterThanOrEqual(2.0);
  });

  it("validates timeline sanity and detects abnormal outro duration", () => {
    // Case 1: Healthy timeline
    const healthy = validateTimelineSanity({
      sceneBoundaries: [10, 20, 30, 40, 50, 60, 71],
      totalDurationSec: 76.4,
      sceneCount: 8,
      isOutroLast: true,
    });
    expect(healthy.valid).toBe(true);

    // Case 2: Outro triggered too early (lasting 44 seconds!)
    const broken = validateTimelineSanity({
      sceneBoundaries: [5, 9, 14, 20, 22, 27, 32.42],
      totalDurationSec: 76.4,
      sceneCount: 8,
      isOutroLast: true,
    });
    expect(broken.valid).toBe(false);
    expect(broken.errors.some((e: string) => e.includes("Outro xuất hiện quá sớm"))).toBe(true);
  });
});
