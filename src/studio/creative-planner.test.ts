import { describe, it, expect } from "vitest";
import {
  validateVisualPlan,
  deterministicVisualPlanner,
  planCreativeVisuals,
} from "./creative-planner.js";
import type { SourceContent } from "../script/types.js";
import { FakeLLMProvider } from "../script/llm-provider.js";

describe("Creative Mode - AI Visual Planner", () => {
  const dummySource: SourceContent = {
    title: "html-video monorepo",
    content: "HTML to Video meta-layer for coding agents. Convert web code to MP4.",
    url: "https://github.com/nexu-io/html-video",
    domain: "github.com",
    ogImage: null,
  };

  const dummyTranscript = "Chào mừng bạn đến với công cụ HTML sang Video. Hệ thống hỗ trợ dựng hoạt họa bằng GSAP và HyperFrames. Xuất bản video chuẩn mười tám mươi nhân mười chín hai mươi. Hãy theo dõi kênh để nhận thông tin mới nhất.";

  it("deterministicVisualPlanner produces valid scenes preserving the transcript", () => {
    const scenes = deterministicVisualPlanner(dummyTranscript, dummySource, []);

    expect(scenes.length).toBeGreaterThanOrEqual(3);
    expect(scenes[0].type).toBe("hook");
    expect(scenes[scenes.length - 1].type).toBe("outro");

    // Check that all words are accounted for
    const joined = scenes.map((s) => s.voiceText).join(" ");
    expect(joined).toContain("HTML sang Video");
    expect(joined).toContain("theo dõi kênh");
  });

  it("validateVisualPlan accepts valid LLM scene output", () => {
    const candidateScenes = [
      {
        id: "scene-1",
        type: "hook",
        voiceText: "Chào mừng bạn đến với công cụ HTML sang Video.",
        templateData: { template: "hook", headline: "HTML TO VIDEO", kenBurns: "zoom-in" },
      },
      {
        id: "scene-2",
        type: "body",
        voiceText: "Hệ thống hỗ trợ dựng hoạt họa bằng GSAP và HyperFrames.",
        templateData: { template: "feature-list", title: "CÔNG NGHỆ CHÍNH", bullets: ["GSAP Runtime", "HyperFrames"] },
      },
      {
        id: "scene-3",
        type: "outro",
        voiceText: "Hãy theo dõi kênh để nhận thông tin mới nhất.",
        templateData: { template: "outro", ctaTop: "Đăng ký kênh", channelName: "DevPeek36", source: "GitHub" },
      },
    ];

    const shortTranscript = "Chào mừng bạn đến với công cụ HTML sang Video. Hệ thống hỗ trợ dựng hoạt họa bằng GSAP và HyperFrames. Hãy theo dõi kênh để nhận thông tin mới nhất.";
    const validated = validateVisualPlan(candidateScenes, shortTranscript);

    expect(validated.length).toBe(3);
    expect(validated[0].type).toBe("hook");
  });

  it("planCreativeVisuals falls back cleanly if LLM throws an error", async () => {
    const failingLlm = new FakeLLMProvider({
      generator: () => {
        throw new Error("Simulated LLM rate limit or invalid output");
      },
    });

    const scenes = await planCreativeVisuals({
      transcript: dummyTranscript,
      url: dummySource.url,
      source: dummySource,
      availableAssets: [],
      llmProvider: failingLlm,
      channelName: "DevPeek36",
    });

    expect(scenes.length).toBeGreaterThanOrEqual(3);
    expect(scenes[0].type).toBe("hook");
    expect(scenes[scenes.length - 1].type).toBe("outro");
  });
});
