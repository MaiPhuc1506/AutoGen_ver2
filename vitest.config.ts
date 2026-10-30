import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    // FFmpeg-based tests share CPU/RAM with the optional local TTS model.
    maxWorkers: 2,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
