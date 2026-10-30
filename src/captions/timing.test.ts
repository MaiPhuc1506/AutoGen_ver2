import { describe, it, expect } from "vitest";
import { groupWordsIntoCues } from "./grouper.js";
import { estimateWordTimings } from "./estimator.js";
import { TimedWord } from "./types.js";

describe("Caption Timing & Grouper (M1)", () => {
  describe("Edge TTS Word Boundary & Cue Deviation (Criterion 2)", () => {
    it("ensures cue start time deviation vs spoken word start is <= 150ms (exact: 0ms)", () => {
      // Mocked words derived from Edge TTS WordBoundary events
      // 10,000 ticks = 1ms. E.g. offset 1,000,000 = 100ms.
      const mockEdgeWords: TimedWord[] = [
        { text: "Hôm", startMs: 120, endMs: 380 },
        { text: "nay,", startMs: 390, endMs: 720 },
        { text: "chúng", startMs: 740, endMs: 1050 },
        { text: "ta", startMs: 1060, endMs: 1220 },
        { text: "khám", startMs: 1240, endMs: 1560 },
        { text: "phá", startMs: 1570, endMs: 1890 },
        { text: "công", startMs: 1910, endMs: 2240 },
        { text: "nghệ", startMs: 2250, endMs: 2580 },
        { text: "mới.", startMs: 2600, endMs: 3000 },
      ];

      const cues = groupWordsIntoCues(mockEdgeWords, {
        sceneStartMs: 500, // scene offset in global timeline
        minWordsPerCue: 2,
        maxWordsPerCue: 4,
      });

      expect(cues.length).toBeGreaterThan(1);

      // Verify each cue starts within <= 150ms of its first spoken word
      for (const cue of cues) {
        const firstWord = cue.words[0];
        const lastWord = cue.words[cue.words.length - 1];

        // Deviation between cue start and first word start
        const startDeviationMs = Math.abs(cue.startMs - firstWord.startMs);
        expect(startDeviationMs).toBeLessThanOrEqual(150);

        // Deviation between cue end and last word end
        const endDeviationMs = Math.abs(cue.endMs - lastWord.endMs);
        // Note: cue end might be padded to minDurationMs (>= 400ms), but should never start late
        expect(cue.endMs).toBeGreaterThanOrEqual(lastWord.endMs);
      }
    });

    it("respects punctuation breaks and word limits", () => {
      const words: TimedWord[] = [
        { text: "Xin", startMs: 0, endMs: 200 },
        { text: "chào!", startMs: 210, endMs: 500 }, // punctuation break
        { text: "Đây", startMs: 550, endMs: 800 },
        { text: "là", startMs: 810, endMs: 1000 },
        { text: "bản", startMs: 1010, endMs: 1200 },
        { text: "tin", startMs: 1210, endMs: 1500 },
      ];

      const cues = groupWordsIntoCues(words, {
        minWordsPerCue: 2,
        maxWordsPerCue: 4,
      });

      expect(cues).toHaveLength(2);
      expect(cues[0].text).toBe("Xin chào!");
      expect(cues[1].text).toBe("Đây là bản tin");
    });
  });

  describe("Fallback Estimator for Providers Without Timestamps", () => {
    it("estimates proportional word timings across scene duration", () => {
      const text = "Mô hình ngôn ngữ lớn hoạt động cực kỳ ấn tượng";
      const durationSec = 3.5; // 3500ms
      const offsetMs = 1000;

      const estimated = estimateWordTimings(text, durationSec, offsetMs);

      expect(estimated.length).toBe(11);

      // First word starts at offsetMs
      expect(estimated[0].startMs).toBe(offsetMs);

      // Last word ends at offsetMs + durationSec * 1000
      const lastWord = estimated[estimated.length - 1];
      expect(lastWord.endMs).toBe(offsetMs + 3500);

      // Timings are strictly sequential
      for (let i = 0; i < estimated.length - 1; i++) {
        expect(estimated[i].endMs).toBe(estimated[i + 1].startMs);
        expect(estimated[i].endMs).toBeGreaterThan(estimated[i].startMs);
      }
    });

    it("handles empty voiceText gracefully", () => {
      const result = estimateWordTimings("", 2.0);
      expect(result).toEqual([]);
    });
  });
});

it('does not preview the next sentence during the spoken pause after a single-word cue',()=>{
 const cues=groupWordsIntoCues([{text:'GitHub.',startMs:100,endMs:500},{text:'Gỡ',startMs:1200,endMs:1450},{text:'quảng',startMs:1450,endMs:1650},{text:'cáo.',startMs:1650,endMs:1900}]);
 expect(cues[0].text).toBe('GitHub.');expect(cues[0].endMs).toBe(500);expect(cues[1].startMs).toBe(1200);
});
