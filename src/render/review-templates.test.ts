import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ScriptSchema, TemplateData } from "./script-schema.js";
import { composeHtml } from "./html-composer.js";

describe("Review Templates (M3)", () => {
  const fixturePath = "tests/fixtures/sample-script-review-templates.json";
  const fixtureJson = JSON.parse(readFileSync(fixturePath, "utf8"));

  describe("Zod Schema Validation", () => {
    it("successfully parses the 8-scene review template fixture", () => {
      const parsed = ScriptSchema.safeParse(fixtureJson);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.scenes).toHaveLength(8);
      }
    });

    describe("spec-table", () => {
      it("validates valid spec-table", () => {
        const res = TemplateData.safeParse({
          template: "spec-table",
          productName: "iPhone 16 Pro",
          specs: [
            { label: "Chip", value: "A18 Pro" },
            { label: "RAM", value: "8GB" },
          ],
        });
        expect(res.success).toBe(true);
      });

      it("rejects spec-table with 0 specs", () => {
        const res = TemplateData.safeParse({
          template: "spec-table",
          productName: "iPhone 16 Pro",
          specs: [],
        });
        expect(res.success).toBe(false);
      });

      it("rejects spec-table with more than 6 specs", () => {
        const res = TemplateData.safeParse({
          template: "spec-table",
          productName: "iPhone 16 Pro",
          specs: Array.from({ length: 7 }, (_, i) => ({ label: `L${i}`, value: `V${i}` })),
        });
        expect(res.success).toBe(false);
      });
    });

    describe("pros-cons", () => {
      it("validates valid pros-cons", () => {
        const res = TemplateData.safeParse({
          template: "pros-cons",
          title: "Đánh giá nhanh",
          pros: ["Pin trâu", "Màn đẹp"],
          cons: ["Sạc chậm"],
        });
        expect(res.success).toBe(true);
      });

      it("rejects pros-cons with empty pros", () => {
        const res = TemplateData.safeParse({
          template: "pros-cons",
          pros: [],
          cons: ["Sạc chậm"],
        });
        expect(res.success).toBe(false);
      });

      it("rejects pros-cons with more than 4 items in a list", () => {
        const res = TemplateData.safeParse({
          template: "pros-cons",
          pros: ["1", "2", "3", "4", "5"],
          cons: ["1"],
        });
        expect(res.success).toBe(false);
      });
    });

    describe("verdict-score", () => {
      it("validates valid verdict-score on 10 scale", () => {
        const res = TemplateData.safeParse({
          template: "verdict-score",
          productName: "Galaxy S26",
          score: 8.8,
          scale: "10",
          verdict: "Rất tốt",
          summary: "Đáng mua trong phân khúc cao cấp.",
        });
        expect(res.success).toBe(true);
      });

      it("validates valid verdict-score on 100 scale", () => {
        const res = TemplateData.safeParse({
          template: "verdict-score",
          productName: "Galaxy S26",
          score: 88,
          scale: "100",
          verdict: "Rất tốt",
          summary: "Đáng mua trong phân khúc cao cấp.",
        });
        expect(res.success).toBe(true);
      });

      it("rejects invalid score > 100", () => {
        const res = TemplateData.safeParse({
          template: "verdict-score",
          productName: "Galaxy S26",
          score: 105,
          scale: "100",
          verdict: "Rất tốt",
          summary: "Đáng mua.",
        });
        expect(res.success).toBe(false);
      });
    });

    describe("price-tag", () => {
      it("validates valid price-tag", () => {
        const res = TemplateData.safeParse({
          template: "price-tag",
          productName: "MacBook Air",
          price: "24.990.000đ",
          variant: "16GB RAM",
          note: "Hàng chính hãng",
        });
        expect(res.success).toBe(true);
      });

      it("rejects price-tag missing price", () => {
        const res = TemplateData.safeParse({
          template: "price-tag",
          productName: "MacBook Air",
        });
        expect(res.success).toBe(false);
      });
    });

    describe("image-gallery", () => {
      it("validates valid image-gallery with 2 images", () => {
        const res = TemplateData.safeParse({
          template: "image-gallery",
          title: "Thiết kế",
          images: [
            { src: "img1.jpg", caption: "Mặt trước" },
            { src: "img2.jpg" },
          ],
        });
        expect(res.success).toBe(true);
      });

      it("rejects image-gallery with 0 images", () => {
        const res = TemplateData.safeParse({
          template: "image-gallery",
          images: [],
        });
        expect(res.success).toBe(false);
      });

      it("rejects image-gallery with more than 3 images", () => {
        const res = TemplateData.safeParse({
          template: "image-gallery",
          images: [
            { src: "1.jpg" },
            { src: "2.jpg" },
            { src: "3.jpg" },
            { src: "4.jpg" },
          ],
        });
        expect(res.success).toBe(false);
      });
    });

    describe("phone-mockup", () => {
      it("validates valid phone-mockup", () => {
        const res = TemplateData.safeParse({
          template: "phone-mockup",
          title: "App mới",
          screenSrc: "mockup.png",
          caption: "Trải nghiệm mượt",
        });
        expect(res.success).toBe(true);
      });

      it("rejects phone-mockup with missing screenSrc", () => {
        const res = TemplateData.safeParse({
          template: "phone-mockup",
          title: "App mới",
        });
        expect(res.success).toBe(false);
      });
    });
  });

  describe("HTML Composer Rendering & CSS", () => {
    const sceneAudio = [
      { id: "scene-1", durationSec: 3.0 },
      { id: "scene-2", durationSec: 4.0 },
      { id: "scene-3", durationSec: 4.0 },
      { id: "scene-4", durationSec: 3.5 },
      { id: "scene-5", durationSec: 3.5 },
      { id: "scene-6", durationSec: 4.0 },
      { id: "scene-7", durationSec: 4.0 },
      { id: "scene-8", durationSec: 3.0 },
    ];

    it("renders HTML with all 6 review templates", () => {
      const html = composeHtml({
        script: fixtureJson,
        sceneAudio,
        gapSec: 0.3,
        bgImageRelPath: null,
        audioRelPath: "voice.mp3",
        mediaMap: {'scene-7':{sceneId:'scene-7',type:'image',originalSrc:'screen-mockup.png',localRelPath:'media/screen-mockup.png',fit:'contain',fx:'none'}},
      });

      // spec-table
      expect(html).toContain('class="layout-spec-table"');
      expect(html).toContain("Snapdragon 8 Elite Gen 2");
      expect(html).toContain('class="spec-label"');
      expect(html).toContain('class="spec-value"');

      // pros-cons
      expect(html).toContain('class="layout-pros-cons"');
      expect(html).toContain('class="pros-col"');
      expect(html).toContain('class="cons-col"');
      expect(html).toContain("Hiệu năng cực kỳ mượt mà");
      expect(html).toContain("Cụm camera lồi khá nhiều");

      // verdict-score
      expect(html).toContain('class="layout-verdict-score"');
      expect(html).toContain('class="verdict-score-badge shimmer-sweep-target"');
      expect(html).toContain('class="score-number">9.2</span>');
      expect(html).toContain('class="score-scale">/10</span>');
      expect(html).toContain("Flagship xuất sắc");

      // price-tag
      expect(html).toContain('class="layout-price-tag"');
      expect(html).toContain('class="price-amount">29.990.000đ</div>');
      expect(html).toContain("Phiên bản 12GB / 256GB");

      // image-gallery
      expect(html).toContain('class="layout-image-gallery"');
      expect(html).toContain('class="gallery-card gallery-card-0"');
      expect(html).toContain("Khung viền titan");

      // phone-mockup
      expect(html).toContain('class="layout-phone-mockup"');
      expect(html).toContain('class="phone-frame"');
      expect(html).toContain('class="phone-island"');
      expect(html).toContain('src="media/screen-mockup.png"');

      // Animations dispatcher check
      expect(html).toContain('animateSpecTable(scene, tl, start)');
      expect(html).toContain('animateProsCons(scene, tl, start)');
      expect(html).toContain('animateVerdictScore(scene, tl, start)');
      expect(html).toContain('animatePriceTag(scene, tl, start)');
      expect(html).toContain('animateImageGallery(scene, tl, start)');
      expect(html).toContain('animatePhoneMockup(scene, tl, start)');
    });

    it("ensures dark-neon styles contain all 6 review layout classes", () => {
      const css = readFileSync("src/render/templates/styles.css", "utf8");
      expect(css).toContain(".layout-spec-table");
      expect(css).toContain(".layout-pros-cons");
      expect(css).toContain(".layout-verdict-score");
      expect(css).toContain(".layout-price-tag");
      expect(css).toContain(".layout-image-gallery");
      expect(css).toContain(".layout-phone-mockup");
    });

    it("ensures light-pro styles contain all 6 review layout classes", () => {
      const css = readFileSync("src/render/templates/styles.light-pro.css", "utf8");
      expect(css).toContain(".layout-spec-table");
      expect(css).toContain(".layout-pros-cons");
      expect(css).toContain(".layout-verdict-score");
      expect(css).toContain(".layout-price-tag");
      expect(css).toContain(".layout-image-gallery");
      expect(css).toContain(".layout-phone-mockup");
    });
  });
});
