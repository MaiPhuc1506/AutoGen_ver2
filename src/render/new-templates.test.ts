import { describe, it, expect } from "vitest";
import { Scene, TemplateData } from "./script-schema.js";
import { renderReferenceScene } from "./reference-scenes.js";
import { TEMPLATE_CATALOG } from "./template-catalog.js";
import type { Script, SceneType } from "./script-schema.js";

const mockScript: Script = {
  version: "1.0",
  metadata: {
    title: "Test Repo",
    channel: "DevPeek36",
    source: {
      url: "https://github.com/facebook/react",
      domain: "github.com",
      image: null,
    },
  },
  voice: {
    provider: "imported",
    voiceId: "voice-1",
    speed: 1.0,
  },
  scenes: [
    {
      id: "hook",
      type: "hook",
      voiceText: "Hello world",
      templateData: {
        template: "hook",
        headline: "React 19",
        subhead: "Action hook",
        kenBurns: "zoom-in",
      },
    },
    {
      id: "outro",
      type: "outro",
      voiceText: "Follow for more",
      templateData: {
        template: "outro",
        ctaTop: "Follow us",
        channelName: "DevPeek",
        source: "github.com",
      },
    },
  ],
};

const mockTiktok = {
  displayName: "DevPeek36",
  handle: "@DevPeek36",
  followers: "10K",
  paddingTop: 100,
  paddingBottom: 240,
  paddingHorizontal: 40,
};

describe("New Templates (kinetic-headline, quote-card, step-by-step, visual-focus)", () => {
  describe("Catalog entries", () => {
    it("has catalog item for kinetic-headline", () => {
      const entry = TEMPLATE_CATALOG.find(t => t.id === "kinetic-headline");
      expect(entry).toBeDefined();
      expect(entry?.data.template).toBe("kinetic-headline");
      expect(entry?.label).toContain("Kinetic");
    });

    it("has catalog item for quote-card", () => {
      const entry = TEMPLATE_CATALOG.find(t => t.id === "quote-card");
      expect(entry).toBeDefined();
      expect(entry?.data.template).toBe("quote-card");
      expect(entry?.label).toContain("trích dẫn");
    });

    it("has catalog item for step-by-step", () => {
      const entry = TEMPLATE_CATALOG.find(t => t.id === "step-by-step");
      expect(entry).toBeDefined();
      expect(entry?.data.template).toBe("step-by-step");
      expect(entry?.label).toContain("bước");
    });

    it("has catalog item for visual-focus", () => {
      const entry = TEMPLATE_CATALOG.find(t => t.id === "visual-focus");
      expect(entry).toBeDefined();
      expect(entry?.data.template).toBe("visual-focus");
      expect(entry?.label).toContain("thị giác");
    });
  });

  describe("Schema validation via Scene", () => {
    it("validates kinetic-headline scene", () => {
      const scene = {
        id: "hook-kinetic",
        type: "hook",
        voiceText: "Khám phá kiến trúc hoàn toàn mới",
        transitionPreset: "directional-slide",
        motionPreset: "energetic",
        motionIntensity: "high",
        templateData: {
          template: "kinetic-headline",
          headline: "KIẾN TRÚC ĐỘT PHÁ 2026",
          punchword: "ĐỘT PHÁ",
          subhead: "Hệ thống phân tán thế hệ mới",
          theme: "mint" as const,
        },
        visualEvents: [
          {
            targetCueId: 1,
            targetElement: ".ref-punchword",
            timingSource: "scene-start" as const,
            eventType: "keyword-pop" as const,
            atSec: 0.5,
            durationSec: 0.4,
            motionPreset: "energetic" as const,
            motionIntensity: "high" as const,
          },
        ],
      };
      const parsed = Scene.parse(scene);
      expect(parsed.templateData.template).toBe("kinetic-headline");
      expect(parsed.transitionPreset).toBe("directional-slide");
      expect(parsed.visualEvents?.[0].eventType).toBe("keyword-pop");
    });

    it("validates quote-card scene", () => {
      const scene = {
        id: "quote-1",
        type: "body",
        voiceText: "Đơn giản là đỉnh cao của sự tinh tế",
        templateData: {
          template: "quote-card",
          quote: "Simplicity is prerequisite for reliability.",
          author: "Edsger W. Dijkstra",
          role: "Computer Scientist",
          source: "EWD498",
        },
      };
      const parsed = Scene.parse(scene);
      expect(parsed.templateData.template).toBe("quote-card");
      if (parsed.templateData.template === "quote-card") {
        expect(parsed.templateData.author).toBe("Edsger W. Dijkstra");
      }
    });

    it("validates step-by-step scene", () => {
      const scene = {
        id: "steps-1",
        type: "body",
        voiceText: "Ba bước cài đặt nhanh chóng",
        templateData: {
          template: "step-by-step",
          title: "Thiết lập dự án",
          steps: [
            { step: "01", label: "Cài đặt CLI", detail: "npm i -g tool" },
            { step: "02", label: "Khởi tạo repo", detail: "tool init" },
            { step: "03", label: "Chạy dev server", detail: "tool dev" },
          ],
        },
      };
      const parsed = Scene.parse(scene);
      expect(parsed.templateData.template).toBe("step-by-step");
    });

    it("validates visual-focus scene", () => {
      const scene = {
        id: "focus-1",
        type: "body",
        voiceText: "Tập trung vào phần lõi xử lý",
        templateData: {
          template: "visual-focus",
          title: "Bộ định tuyến siêu tốc",
          subtitle: "Xử lý 100k requests/s",
          focusArea: {
            x: 50,
            y: 40,
            scale: 1.8,
          },
          mediaSrc: "screenshots/router.png",
          caption: "Benchmark chính thức từ tài liệu",
        },
      };
      const parsed = Scene.parse(scene);
      expect(parsed.templateData.template).toBe("visual-focus");
    });
  });

  describe("HTML Rendering & Safe Areas in reference-scenes", () => {
    it("renders kinetic-headline with punchword and transition attributes", () => {
      const scene: SceneType = {
        id: "scene-k",
        type: "hook",
        voiceText: "Đột phá công nghệ mới",
        transitionPreset: "directional-slide",
        motionPreset: "energetic",
        motionIntensity: "high",
        templateData: {
          template: "kinetic-headline",
          headline: "ĐỘT PHÁ CÔNG NGHỆ",
          punchword: "ĐỘT PHÁ",
          subhead: "Chạy trực tiếp trên thiết bị",
          theme: "mint",
        },
      };
      const html = renderReferenceScene({
        scene,
        start: 0,
        duration: 3.5,
        script: mockScript,
        gallery: [],
        tiktok: mockTiktok,
      });

      expect(html).toContain('id="scene-scene-k"');
      expect(html).toContain('data-transition="directional-slide"');
      expect(html).toContain("ref-kinetic");
      expect(html).toContain("kinetic-punchword");
      expect(html).toContain("ĐỘT PHÁ");
      expect(html).toContain("Chạy trực tiếp trên thiết bị");
    });

    it("renders quote-card with author attribution and quote mark", () => {
      const scene: SceneType = {
        id: "scene-q",
        type: "body",
        voiceText: "Trích dẫn tài liệu",
        templateData: {
          template: "quote-card",
          quote: "Mã sạch luôn đọc như văn xuôi hay.",
          author: "Robert C. Martin",
          role: "Clean Code",
        },
      };
      const html = renderReferenceScene({
        scene,
        start: 3.5,
        duration: 4.0,
        script: mockScript,
        gallery: [],
        tiktok: mockTiktok,
      });

      expect(html).toContain("ref-quote-panel");
      expect(html).toContain("quote-mark");
      expect(html).toContain("Mã sạch luôn đọc như văn xuôi hay.");
      expect(html).toContain("Robert C. Martin");
      expect(html).toContain("Clean Code");
    });

    it("renders step-by-step numbered steps sequentially", () => {
      const scene: SceneType = {
        id: "scene-s",
        type: "body",
        voiceText: "Quy trình thực hiện",
        templateData: {
          template: "step-by-step",
          title: "Các bước thực thi",
          steps: [
            { step: "01", label: "Phân tích mã nguồn", detail: "Quét cây AST" },
            { step: "02", label: "Sinh mã tự động", detail: "Áp dụng mẫu có sẵn" },
          ],
        },
      };
      const html = renderReferenceScene({
        scene,
        start: 7.5,
        duration: 5.0,
        script: mockScript,
        gallery: [],
        tiktok: mockTiktok,
      });

      expect(html).toContain("ref-steps-panel");
      expect(html).toContain("ref-step-item");
      expect(html).toContain("Phân tích mã nguồn");
      expect(html).toContain("Sinh mã tự động");
      expect(html).toContain("01");
      expect(html).toContain("02");
    });

    it("renders visual-focus with fallback and focus parameters", () => {
      const sceneWithoutMedia: SceneType = {
        id: "scene-v1",
        type: "body",
        voiceText: "Vùng trọng tâm",
        templateData: {
          template: "visual-focus",
          title: "Giao diện lõi",
          subtitle: "Bảng điều khiển tác vụ",
          focusArea: { x: 50, y: 50, scale: 1.6 },
        },
      };
      const html1 = renderReferenceScene({
        scene: sceneWithoutMedia,
        start: 12.5,
        duration: 4.0,
        script: mockScript,
        gallery: [],
        tiktok: mockTiktok,
      });

      expect(html1).toContain("ref-focus-panel");
      expect(html1).toContain("ref-placeholder-viewport");
      expect(html1).toContain("Giao diện lõi");

      const sceneWithMedia: SceneType = {
        id: "scene-v2",
        type: "body",
        voiceText: "Chi tiết màn hình",
        templateData: {
          template: "visual-focus",
          title: "Chỉ số hiệu năng",
          mediaSrc: "images/screen.png",
          caption: "Biểu đồ tải CPU",
          focusArea: { x: 30, y: 70, scale: 2.0 },
        },
      };
      const html2 = renderReferenceScene({
        scene: sceneWithMedia,
        start: 16.5,
        duration: 4.0,
        script: mockScript,
        media: {
          localRelPath: "images/screen.png",
          originalSrc: "images/screen.png",
          type: "screenshot",
        } as any,
        gallery: [],
        tiktok: mockTiktok,
      });

      expect(html2).toContain("ref-focus-panel");
      expect(html2).toContain("images/screen.png");
      expect(html2).toContain('data-focus-scale="2"');
    });

    it("serializes visualEvents into data-visual-events attribute", () => {
      const scene: SceneType = {
        id: "scene-events",
        type: "body",
        voiceText: "Số liệu nhảy số",
        templateData: {
          template: "kinetic-headline",
          headline: "TĂNG TỐC 10 LẦN",
          theme: "mint",
        },
        visualEvents: [
          {
            targetCueId: 5,
            targetElement: ".ref-punchword",
            timingSource: "explicit-sec",
            eventType: "number-count",
            atSec: 1.0,
            durationSec: 0.6,
            motionPreset: "energetic",
            motionIntensity: "medium",
          },
        ],
      };
      const html = renderReferenceScene({
        scene,
        start: 20.5,
        duration: 3.5,
        script: mockScript,
        gallery: [],
        tiktok: mockTiktok,
      });

      expect(html).toContain('data-visual-events=');
      expect(html).toContain("number-count");
      expect(html).toContain("ref-punchword");
    });
  });
});
