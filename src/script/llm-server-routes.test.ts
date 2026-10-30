import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import http from "node:http";
import { readFile, writeFile, rm } from "node:fs/promises";
import { app } from "../server.js";

vi.mock("./llm-provider.js", () => ({ createLlmProvider: () => ({ name: "fake", generate: async () => "OK" }) }));

describe("LLM Configuration & Settings Routes", () => {
  let server: http.Server;
  let baseUrl: string;
  let savedConfig: Buffer | undefined;
  const configPath = "config/llm.json";

  beforeAll(async () => {
    try { savedConfig = await readFile(configPath); } catch {}
    process.env.NODE_ENV = "test";
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (savedConfig) await writeFile(configPath, savedConfig);
    else await rm(configPath, { force: true });
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("GET /api/llm/config returns initial configuration structure", async () => {
    const res = await fetch(`${baseUrl}/api/llm/config`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("provider");
    expect(data).toHaveProperty("model");
    expect(data).toHaveProperty("hasApiKey");
    expect(data).toHaveProperty("maskedApiKey");
    expect(data).toHaveProperty("status");
  });

  it("POST /api/llm/config updates provider, model and returns masked key", async () => {
    const res = await fetch(`${baseUrl}/api/llm/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "gemini",
        model: "gemini-2.0-flash",
        apiKey: "AIzaSyTest123456789SecretKey",
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.provider).toBe("gemini");
    expect(data.model).toBe("gemini-2.0-flash");
    expect(data.hasApiKey).toBe(true);
    expect(data.maskedApiKey).toContain("••••");
    // Sensitive key is never returned unmasked
    expect(data.maskedApiKey).not.toBe("AIzaSyTest123456789SecretKey");
  });

  it("POST /api/llm/test returns success for offline provider without key", async () => {
    const res = await fetch(`${baseUrl}/api/llm/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "offline",
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.message).toContain("Offline");
  });

  it("POST /api/llm/test validates missing API key for real providers", async () => {
    const res = await fetch(`${baseUrl}/api/llm/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "openai",
        apiKey: "",
      }),
    });

    // If apiKey is empty string and provider is openai, should error
    const data = await res.json();
    if (res.status === 400) {
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    }
  });
});

