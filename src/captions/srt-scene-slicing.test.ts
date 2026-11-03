import { describe, it, expect } from "vitest";
import {
  sliceScenesFromSrtCues,
  alignCreativeAudioAndSubtitles,
  type SceneCueGrouping,
} from "./audio-aligner.js";
import { parseSrt } from "./srt.js";
import type { CaptionCue } from "./types.js";

describe("Phase 1: SRT-Driven Scene Slicing & Boundary Synchronization", () => {
  const sampleSrt = `1
00:00:00,000 --> 00:00:01,540
AI không chỉ biết viết code.

2
00:00:02,080 --> 00:00:04,440
Giờ nó còn học cách đọc biểu đồ giá Bitcoin.

3
00:00:05,070 --> 00:00:07,300
Và đây là một dự án mã nguồn mở khá thú vị.

4
00:00:07,780 --> 00:00:08,900
Nó tên là Kronos, mô hình cho thị trường tài chính.

5
00:00:09,250 --> 00:00:12,430
Mô hình được huấn luyện trên 45 sàn giao dịch toàn cầu.

6
00:00:13,000 --> 00:00:16,500
Khi nhìn biểu đồ nến, ta thấy giá mở cửa, đóng cửa, cao nhất và thấp nhất.

7
00:00:17,000 --> 00:00:19,200
Khám phá ngay repo này trên GitHub.
`;

  it("slices scenes strictly along SRT cue boundaries without splitting cues", () => {
    const cues = parseSrt(sampleSrt);
    expect(cues.length).toBe(7);

    // Grouping: Scene 1 (cues 1-2), Scene 2 (cues 3-4), Scene 3 (cues 5-6), Scene 4 (cue 7)
    const groupings: SceneCueGrouping[] = [
      { startCueId: 1, endCueId: 2 },
      { startCueId: 3, endCueId: 4 },
      { startCueId: 5, endCueId: 6 },
      { startCueId: 7, endCueId: 7 },
    ];

    const result = sliceScenesFromSrtCues(cues, groupings, 20.0);

    expect(result.scenes.length).toBe(4);

    // Scene 1: cues 1-2
    expect(result.scenes[0].startCueId).toBe(1);
    expect(result.scenes[0].endCueId).toBe(2);
    expect(result.scenes[0].startSec).toBe(0);
    expect(result.scenes[0].endSec).toBe(4.44);
    expect(result.scenes[0].text).toContain("AI không chỉ biết viết code.");
    expect(result.scenes[0].text).toContain("biểu đồ giá Bitcoin");

    // Scene 2: cues 3-4
    expect(result.scenes[1].startCueId).toBe(3);
    expect(result.scenes[1].endCueId).toBe(4);
    expect(result.scenes[1].startSec).toBe(4.44);
    expect(result.scenes[1].endSec).toBe(8.9);

    // Scene 3: cues 5-6
    expect(result.scenes[2].startCueId).toBe(5);
    expect(result.scenes[2].endCueId).toBe(6);
    expect(result.scenes[2].startSec).toBe(8.9);
    expect(result.scenes[2].endSec).toBe(16.5);

    // Scene 4: cue 7
    expect(result.scenes[3].startCueId).toBe(7);
    expect(result.scenes[3].endCueId).toBe(7);
    expect(result.scenes[3].startSec).toBe(16.5);
    expect(result.scenes[3].endSec).toBe(20.0); // clamped to total duration
  });

  it("guarantees continuous scene boundaries without gaps or overlaps", () => {
    const cues = parseSrt(sampleSrt);
    const groupings: SceneCueGrouping[] = [
      { startCueId: 1, endCueId: 3 },
      { startCueId: 4, endCueId: 5 },
      { startCueId: 6, endCueId: 7 },
    ];

    const totalDur = 20.0;
    const result = sliceScenesFromSrtCues(cues, groupings, totalDur);

    // Boundaries are the transition points between consecutive scenes
    expect(result.sceneBoundaries.length).toBe(result.scenes.length - 1);

    for (let i = 0; i < result.scenes.length - 1; i++) {
      const currentSceneEnd = result.scenes[i].endSec;
      const nextSceneStart = result.scenes[i + 1].startSec;
      // Strict equality between scene i end and scene i+1 start
      expect(currentSceneEnd).toBe(nextSceneStart);
      expect(result.sceneBoundaries[i]).toBe(currentSceneEnd);
    }

    // Monotonicity
    for (let i = 1; i < result.sceneBoundaries.length; i++) {
      expect(result.sceneBoundaries[i]).toBeGreaterThan(result.sceneBoundaries[i - 1]);
    }
  });

  it("handles non-contiguous or overlapping groupings safely without dropping cues", () => {
    const cues = parseSrt(sampleSrt);
    // Malformed input from LLM: gap between 2 and 4, overlap between 5 and 6
    const messyGroupings: SceneCueGrouping[] = [
      { startCueId: 1, endCueId: 2 },
      { startCueId: 4, endCueId: 5 }, // cue 3 skipped by LLM
      { startCueId: 5, endCueId: 7 }, // overlap on cue 5
    ];

    const result = sliceScenesFromSrtCues(cues, messyGroupings, 20.0);

    // Backend normalization repairs the groupings into a contiguous sequence
    expect(result.scenes.length).toBeGreaterThanOrEqual(2);
    expect(result.scenes[0].startCueId).toBe(1);
    expect(result.scenes[result.scenes.length - 1].endCueId).toBe(7);

    // Check continuous coverage: each scene starts where previous ended
    for (let i = 1; i < result.scenes.length; i++) {
      expect(result.scenes[i].startCueId).toBe(result.scenes[i - 1].endCueId + 1);
      expect(result.scenes[i].startSec).toBe(result.scenes[i - 1].endSec);
    }
  });

  it("flags abnormally long cues with warnings without blind splitting", () => {
    const srtWithLongCue = `1
00:00:00,000 --> 00:00:02,000
Đoạn mở đầu ngắn.

2
00:00:02,500 --> 00:00:17,800
Đây là một câu nói cực kỳ dài kéo dài hơn 15 giây liên tục không có ngắt nghỉ được phát hiện trong file SRT của người dùng.

3
00:00:18,000 --> 00:00:20,000
Đoạn kết thúc video.
`;

    const cues = parseSrt(srtWithLongCue);
    const result = sliceScenesFromSrtCues(cues, undefined, 20.0);

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("Cue #2 có thời lượng dài bất thường");
    expect(result.warnings[0]).toContain("Giữ nguyên cue theo nguyên tắc không tự cắt phỏng đoán");

    // Cue #2 is preserved intact
    const longCueScene = result.scenes.find((s) => s.startCueId <= 2 && s.endCueId >= 2);
    expect(longCueScene).toBeDefined();
    expect(longCueScene!.durationSec).toBeGreaterThanOrEqual(15.0);
  });

  it("integrates seamlessly into alignCreativeAudioAndSubtitles with srt-sliced timingQuality", async () => {
    const groupings: SceneCueGrouping[] = [
      { startCueId: 1, endCueId: 3 },
      { startCueId: 4, endCueId: 5 },
      { startCueId: 6, endCueId: 7 },
    ];

    const alignment = await alignCreativeAudioAndSubtitles({
      audioPath: "dummy.mp3",
      totalDurationSec: 20.0,
      srtContent: sampleSrt,
      sceneGroupings: groupings,
    });

    expect(alignment.timingQuality.source).toBe("imported-srt");
    expect(alignment.timingQuality.sceneTiming).toBe("srt-sliced");
    expect(alignment.timingQuality.cueAccuracy).toBe("unverified");
    expect(alignment.sceneBoundaries.length).toBe(2);
    expect(alignment.sceneBoundaries[0]).toBe(7.3); // end of cue 3
    expect(alignment.sceneBoundaries[1]).toBe(12.43); // end of cue 5
  });

  it("maintains backward compatibility when no sceneGroupings are passed", async () => {
    const alignment = await alignCreativeAudioAndSubtitles({
      audioPath: "dummy.mp3",
      totalDurationSec: 20.0,
      srtContent: sampleSrt,
      // sceneGroupings omitted -> backward compatible audio-mapped fallback
    });

    expect(alignment.timingQuality.source).toBe("imported-srt");
    expect(alignment.timingQuality.sceneTiming).toBe("audio-mapped");
    expect(alignment.sceneBoundaries.length).toBeGreaterThan(0);
  });
});
