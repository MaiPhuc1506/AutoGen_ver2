import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  GroqWhisperProvider,
  OpenAiWhisperProvider,
  GeminiAudioProvider,
  FakeSttProvider,
  verifyTranscriptMatch,
  createSttProvider,
} from "./stt.js";
import { alignCreativeAudioAndSubtitles } from "./audio-aligner.js";
import axios from "axios";

vi.mock("axios");
const mockedAxios = vi.mocked(axios, true);

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readFile: vi.fn(async (path: any, options?: any) => {
      if (typeof path === "string" && path.includes("dummy")) {
        return Buffer.from("dummy-audio-content");
      }
      return actual.readFile(path, options);
    }),
  };
});

describe("Audio-Driven STT & Alignment System (Phase 2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GroqWhisperProvider", () => {
    it("parses verbose_json with segments and marks wordAccuracy as model-estimated", async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          text: "AI không chỉ biết viết code. Giờ nó còn học cách đọc biểu đồ giá Bitcoin.",
          segments: [
            { id: 0, start: 0.0, end: 1.5, text: "AI không chỉ biết viết code." },
            { id: 1, start: 2.0, end: 4.5, text: "Giờ nó còn học cách đọc biểu đồ giá Bitcoin." },
          ],
          words: [
            { word: "AI", start: 0.0, end: 0.3 },
            { word: "không", start: 0.3, end: 0.6 },
            { word: "chỉ", start: 0.6, end: 0.8 },
            { word: "biết", start: 0.8, end: 1.1 },
            { word: "viết", start: 1.1, end: 1.3 },
            { word: "code.", start: 1.3, end: 1.5 },
          ],
          language: "vi",
        },
      });

      // Pass dummy audio file
      const provider = new GroqWhisperProvider({ apiKey: "gsk_test_key" });
      const res = await provider.transcribe("dummy.mp3");

      expect(res.provider).toBe("groq");
      expect(res.segments.length).toBe(2);
      expect(res.segments[0].startSec).toBe(0.0);
      expect(res.segments[0].endSec).toBe(1.5);
      expect(res.words?.length).toBe(6);
      // Strictly model-estimated, NEVER self-labeled as "verified"
      expect(res.wordAccuracy).toBe("model-estimated");
    });
  });

  describe("OpenAiWhisperProvider", () => {
    it("handles OpenAI Whisper verbose_json format", async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          text: "Kronos là một mô hình AI tài chính.",
          segments: [
            { id: 0, start: 0.0, end: 2.2, text: "Kronos là một mô hình AI tài chính." },
          ],
          words: [
            { word: "Kronos", start: 0.0, end: 0.5 },
            { word: "là", start: 0.5, end: 0.7 },
          ],
          language: "vi",
        },
      });

      const provider = new OpenAiWhisperProvider({ apiKey: "sk_test_key" });
      const res = await provider.transcribe("dummy.mp3");

      expect(res.provider).toBe("openai");
      expect(res.wordAccuracy).toBe("model-estimated");
      expect(res.segments[0].text).toBe("Kronos là một mô hình AI tài chính.");
    });
  });

  describe("GeminiAudioProvider", () => {
    it("transcribes audio using Gemini generateContent JSON response", async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      text: "Một dự án mã nguồn mở đáng chú ý.",
                      segments: [
                        { startSec: 0.0, endSec: 2.4, text: "Một dự án mã nguồn mở đáng chú ý." },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        },
      });

      const provider = new GeminiAudioProvider({ apiKey: "gemini_test_key" });
      const res = await provider.transcribe("dummy.mp3");

      expect(res.provider).toBe("gemini");
      expect(res.wordAccuracy).toBe("unverified");
      expect(res.segments[0].text).toBe("Một dự án mã nguồn mở đáng chú ý.");
    });
  });

  describe("verifyTranscriptMatch (Quality Control)", () => {
    it("returns matched true when reference script matches STT transcript", () => {
      const stt = "AI không chỉ biết viết code. Giờ nó còn học cách đọc biểu đồ giá Bitcoin.";
      const script = "AI không chỉ biết viết code, giờ nó còn học cách đọc biểu đồ giá Bitcoin!";
      const res = verifyTranscriptMatch(stt, script);

      expect(res.matched).toBe(true);
      expect(res.similarity).toBeGreaterThanOrEqual(0.7);
      expect(res.mismatchWarning).toBeUndefined();
    });

    it("detects divergence and generates warning when script differs from audio", () => {
      const stt = "Hôm nay chúng ta tìm hiểu về một công cụ lập trình web mới.";
      const script = "Bitcoin vừa vượt mốc 100 ngàn đô la Mỹ trong phiên giao dịch sáng nay.";
      const res = verifyTranscriptMatch(stt, script);

      expect(res.matched).toBe(false);
      expect(res.similarity).toBeLessThan(0.7);
      expect(res.mismatchWarning).toContain("Cảnh báo: Lời đọc kịch bản chỉ khớp");
    });
  });

  describe("alignCreativeAudioAndSubtitles with STT result", () => {
    it("chunks long STT segments into balanced 3-5 word cues with model-estimated accuracy", async () => {
      const sttResult = {
        text: "Theo nhóm phát triển, mô hình được huấn luyện trên dữ liệu từ hơn 45 sàn giao dịch toàn cầu.",
        segments: [
          {
            id: 1,
            startSec: 1.0,
            endSec: 6.0,
            text: "Theo nhóm phát triển, mô hình được huấn luyện trên dữ liệu từ hơn 45 sàn giao dịch toàn cầu.",
          },
        ],
        provider: "groq" as const,
        wordAccuracy: "model-estimated" as const,
      };

      const res = await alignCreativeAudioAndSubtitles({
        audioPath: "dummy.mp3",
        totalDurationSec: 8.0,
        sttResult,
      });

      expect(res.timingQuality.source).toBe("stt-transcription");
      expect(res.timingQuality.wordAccuracy).toBe("model-estimated");
      expect(res.timingQuality.cueAccuracy).toBe("unverified");
      expect(res.highlightMode).toBe("accurate-only");
      expect(res.cues.length).toBeGreaterThan(1);

      for (const cue of res.cues) {
        const words = cue.text.split(" ");
        expect(words.length).toBeGreaterThanOrEqual(2);
        expect(words.length).toBeLessThanOrEqual(5);
        expect(cue.accuracy).toBe("model-estimated");
      }
    });

    it("automatically runs STT when transcript is omitted in buildCreativeScript", async () => {
      const { buildCreativeScript } = await import("../studio/creative-builder.js");
      const { FakeLLMProvider } = await import("../script/llm-provider.js");
      const fakeStt = new FakeSttProvider({
        text: "AI không chỉ biết viết code. Giờ nó còn học cách đọc biểu đồ giá Bitcoin.",
        segments: [
          { id: 1, startSec: 0.0, endSec: 2.0, text: "AI không chỉ biết viết code." },
          { id: 2, startSec: 2.5, endSec: 5.0, text: "Giờ nó còn học cách đọc biểu đồ giá Bitcoin." },
        ],
      });

      const validUuid = "12345678-1234-4234-8234-123456789abc";
      const uploads = await import("../studio/uploads.js");
      vi.spyOn(uploads, "readUpload").mockResolvedValueOnce({
        uploadId: validUuid,
        path: "dummy.mp3",
        durationSec: 5.5,
        name: "test.mp3",
        size: 1024,
        createdAt: new Date().toISOString(),
      });

      const res = await buildCreativeScript({
        url: "https://github.com/shiyu-coder/Kronos",
        audioUploadId: validUuid,
        sttProvider: fakeStt,
        llmProvider: new FakeLLMProvider(),
      });

      expect(fakeStt.callCount).toBe(1);
      expect(res.transcript).toContain("AI không chỉ biết viết code.");
      expect(res.script.scenes.length).toBeGreaterThan(0);
      expect(res.alignment.timingQuality.source).toBe("stt-transcription");
    }, 15000);
  });
});
