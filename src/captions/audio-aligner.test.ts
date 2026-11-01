import { describe, it, expect, vi } from "vitest";
import {
  calculateTextOverlap,
  mapScenesToAudioTimestamps,
  alignCreativeAudioAndSubtitles,
  normalizeText,
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
});
