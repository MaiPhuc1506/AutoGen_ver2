import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ScriptSchema } from "./script-schema.js";
import { composeHtml } from "./html-composer.js";
import { loadConfig } from "../config.js";
import { mixBgmWithVoice, getDurationSec } from "../assets/audio-tools.js";

describe("Audio Polish, Motion & Preset (M5)", () => {
  const baseScriptJson = {
    schemaVersion: 2,
    preset: "short_30",
    bgm: {
      src: "assets/bgm/ambient-tech.mp3",
      volume: 0.15,
      duck: true,
      duckVolume: 0.05,
    },
    metadata: {
      title: "Video Test M5",
      source: { url: "https://example.com", domain: "example.com", image: null },
      channel: "TechVN Studio",
      safeZoneOverlay: true,
    },
    voice: { provider: "edge-tts", voiceId: "vi-VN-NamMinhNeural", speed: 1.0 },
    scenes: [
      {
        id: "hook",
        type: "hook",
        voiceText: "Đột phá mới về âm thanh và chuyển cảnh.",
        templateData: { template: "hook", headline: "ĐỘT PHÁ MỚI", subhead: "Âm thanh & Chuyển cảnh" },
        transition: { type: "zoom", duration: 0.4 },
      },
      {
        id: "body-1",
        type: "body",
        voiceText: "Hệ thống hỗ trợ chuyển cảnh fade mượt mà.",
        templateData: { template: "stat-hero", value: "99%", label: "Mượt mà" },
        transition: { type: "fade", duration: 0.5 },
      },
      {
        id: "body-2",
        type: "body",
        voiceText: "Hiệu ứng slide từ cạnh màn hình sang trọng.",
        templateData: { template: "callout", statement: "Chuyển động linh hoạt", tag: "MOTION" },
        transition: { type: "slide", duration: 0.3 },
      },
      {
        id: "body-3",
        type: "body",
        voiceText: "Nhạc nền tự động giảm âm lượng khi có giọng nói.",
        templateData: { template: "feature-list", title: "Tính năng", bullets: ["BGM Ducking", "Fade in/out"] },
      },
      {
        id: "outro",
        type: "outro",
        voiceText: "Theo dõi kênh để đón xem những nâng cấp tiếp theo.",
        templateData: { template: "outro", ctaTop: "THEO DÕI", channelName: "TechVN Studio", source: "example.com" },
      },
    ],
  };

  describe("Schema Validation (M5)", () => {
    it("successfully parses script with bgm, transitions, and preset", () => {
      const parsed = ScriptSchema.safeParse(baseScriptJson);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.preset).toBe("short_30");
        expect(parsed.data.bgm?.duck).toBe(true);
        expect(parsed.data.metadata.safeZoneOverlay).toBe(true);
        expect(parsed.data.scenes[0].transition?.type).toBe("zoom");
        expect(parsed.data.scenes[1].transition?.type).toBe("fade");
      }
    });

    it("rejects invalid transition type", () => {
      const invalid = JSON.parse(JSON.stringify(baseScriptJson));
      invalid.scenes[0].transition.type = "invalid-type";
      const parsed = ScriptSchema.safeParse(invalid);
      expect(parsed.success).toBe(false);
    });
  });

  describe("HTML Composer & Safe-Zone (M5)", () => {
    it("renders data-transition attributes and safe-zone overlay", () => {
      const sceneAudio = [
        { id: "hook", durationSec: 3.0 },
        { id: "body-1", durationSec: 3.0 },
        { id: "body-2", durationSec: 3.0 },
        { id: "body-3", durationSec: 3.0 },
        { id: "outro", durationSec: 3.0 },
      ];

      const html = composeHtml({
        purpose: 'preview',
        script: baseScriptJson as any,
        sceneAudio,
        gapSec: 0.3,
        bgImageRelPath: null,
        audioRelPath: "voice.mp3",
      });

      // Transitions
      expect(html).toContain('data-transition="zoom"');
      expect(html).toContain('data-transition="fade"');
      expect(html).toContain('data-transition="slide"');
      expect(html).toContain('data-transition="cut"'); // default for scenes without explicit transition

      // Safe-zone overlay
      expect(html).toContain('id="safe-zone-overlay"');
      expect(html).toContain("TIKTOK CAPTION SAFE-ZONE");
    });
  });

  describe("Brand Configuration (M5)", () => {
    it("loads branding from config/brand.json", () => {
      const cfg = loadConfig();
      // Read the user-configured default channel without invented follower counts.
      expect(cfg.tiktok.displayName).toBe("DevPeek36");
      expect(cfg.tiktok.handle).toBe("@DevPeek36");
      expect(cfg.tiktok.followers).toBe("");
    });
  });

  describe("BGM Audio Ducking (M5)", () => {
    it("creates ducked audio with matching duration", async () => {
      const voice = "tests/fixtures/sample-audio-1.mp3";
      const bgm = "assets/bgm/ambient-tech.mp3";
      const out = "output/test-bgm-duck.mp3";

      await mixBgmWithVoice(voice, bgm, out, {
        volume: 0.15,
        duck: true,
        duckVolume: 0.05,
      });

      expect(existsSync(out)).toBe(true);
      const voiceDur = await getDurationSec(voice);
      const outDur = await getDurationSec(out);
      expect(Math.abs(outDur - voiceDur)).toBeLessThan(0.2);
    });
  });
});

