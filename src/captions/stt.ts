import axios from "axios";
import { readFile } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { log } from "../utils/logger.js";
import { normalizeText, calculateTextOverlap } from "./audio-aligner.js";

export interface SttWord {
  word: string;
  startSec: number;
  endSec: number;
  confidence?: number;
}

export interface SttSegment {
  id?: number;
  startSec: number;
  endSec: number;
  text: string;
  words?: SttWord[];
}

export interface SttResult {
  text: string;
  segments: SttSegment[];
  words?: SttWord[];
  language?: string;
  provider: "groq" | "openai" | "gemini" | "fake" | "fallback";
  wordAccuracy: "model-estimated" | "unverified" | "low";
}

export interface SttProvider {
  readonly name: string;
  transcribe(
    audioPath: string,
    options?: { language?: string; referenceScript?: string }
  ): Promise<SttResult>;
}

export interface SttConfig {
  provider?: "groq" | "openai" | "gemini" | "fake" | "fallback" | "auto";
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

/**
 * Groq Whisper STT Provider (whisper-large-v3).
 * High-speed Vietnamese speech recognition with segment & word timestamps.
 * Word timestamps from Whisper are model-estimated (attention/CTC), not verified forced alignment.
 */
export class GroqWhisperProvider implements SttProvider {
  readonly name = "groq";
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(opts?: { apiKey?: string; model?: string; baseUrl?: string }) {
    this.apiKey = opts?.apiKey || process.env.GROQ_API_KEY || "";
    this.model = opts?.model || "whisper-large-v3";
    this.baseUrl = (opts?.baseUrl || "https://api.groq.com/openai/v1").replace(/\/$/, "");

    if (!this.apiKey) {
      log.warn("[STT] GroqWhisperProvider initialized without GROQ_API_KEY");
    }
  }

  async transcribe(
    audioPath: string,
    options?: { language?: string; referenceScript?: string }
  ): Promise<SttResult> {
    if (!this.apiKey) throw new Error("Groq API key is required for Groq Whisper STT");

    const fileBytes = await readFile(audioPath);
    const fileName = basename(audioPath) || "audio.mp3";
    const mimeType = fileName.endsWith(".wav") ? "audio/wav" : "audio/mpeg";

    const formData = new FormData();
    formData.append("file", new Blob([fileBytes], { type: mimeType }), fileName);
    formData.append("model", this.model);
    formData.append("language", options?.language || "vi");
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities[]", "word");
    formData.append("timestamp_granularities[]", "segment");

    if (options?.referenceScript) {
      // Whisper prompt serves as a vocabulary / domain hint, NOT verified forced alignment
      formData.append("prompt", options.referenceScript.slice(0, 450));
    }

    const response = await axios.post(`${this.baseUrl}/audio/transcriptions`, formData, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      timeout: 120000,
    });

    const data = response.data;
    const segments: SttSegment[] = (data.segments || []).map((s: any) => ({
      id: s.id,
      startSec: Math.max(0, parseFloat(s.start || 0)),
      endSec: Math.max(0, parseFloat(s.end || 0)),
      text: (s.text || "").trim(),
    }));

    const words: SttWord[] = (data.words || []).map((w: any) => ({
      word: (w.word || "").trim(),
      startSec: Math.max(0, parseFloat(w.start || 0)),
      endSec: Math.max(0, parseFloat(w.end || 0)),
    }));

    return {
      text: (data.text || "").trim(),
      segments,
      words: words.length > 0 ? words : undefined,
      language: data.language || "vi",
      provider: "groq",
      wordAccuracy: words.length > 0 ? "model-estimated" : "unverified",
    };
  }
}

/**
 * OpenAI Whisper STT Provider (whisper-1).
 */
export class OpenAiWhisperProvider implements SttProvider {
  readonly name = "openai";
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(opts?: { apiKey?: string; model?: string; baseUrl?: string }) {
    this.apiKey = opts?.apiKey || process.env.OPENAI_API_KEY || "";
    this.model = opts?.model || "whisper-1";
    this.baseUrl = (opts?.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");

    if (!this.apiKey) {
      log.warn("[STT] OpenAiWhisperProvider initialized without OPENAI_API_KEY");
    }
  }

  async transcribe(
    audioPath: string,
    options?: { language?: string; referenceScript?: string }
  ): Promise<SttResult> {
    if (!this.apiKey) throw new Error("OpenAI API key is required for OpenAI Whisper STT");

    const fileBytes = await readFile(audioPath);
    const fileName = basename(audioPath) || "audio.mp3";
    const mimeType = fileName.endsWith(".wav") ? "audio/wav" : "audio/mpeg";

    const formData = new FormData();
    formData.append("file", new Blob([fileBytes], { type: mimeType }), fileName);
    formData.append("model", this.model);
    formData.append("language", options?.language || "vi");
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities[]", "word");
    formData.append("timestamp_granularities[]", "segment");

    if (options?.referenceScript) {
      formData.append("prompt", options.referenceScript.slice(0, 450));
    }

    const response = await axios.post(`${this.baseUrl}/audio/transcriptions`, formData, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      timeout: 120000,
    });

    const data = response.data;
    const segments: SttSegment[] = (data.segments || []).map((s: any) => ({
      id: s.id,
      startSec: Math.max(0, parseFloat(s.start || 0)),
      endSec: Math.max(0, parseFloat(s.end || 0)),
      text: (s.text || "").trim(),
    }));

    const words: SttWord[] = (data.words || []).map((w: any) => ({
      word: (w.word || "").trim(),
      startSec: Math.max(0, parseFloat(w.start || 0)),
      endSec: Math.max(0, parseFloat(w.end || 0)),
    }));

    return {
      text: (data.text || "").trim(),
      segments,
      words: words.length > 0 ? words : undefined,
      language: data.language || "vi",
      provider: "openai",
      wordAccuracy: words.length > 0 ? "model-estimated" : "unverified",
    };
  }
}

/**
 * Gemini Native Multimodal STT Provider.
 * Directly transcribes spoken Vietnamese audio using the project's configured Gemini model.
 */
export class GeminiAudioProvider implements SttProvider {
  readonly name = "gemini";
  private apiKey: string;
  private model: string;

  constructor(opts?: { apiKey?: string; model?: string }) {
    this.apiKey = opts?.apiKey || process.env.GEMINI_API_KEY || process.env.LLM_API_KEY || "";
    this.model = opts?.model || "gemini-flash-lite-latest";

    if (!this.apiKey) {
      log.warn("[STT] GeminiAudioProvider initialized without GEMINI_API_KEY");
    }
  }

  async transcribe(
    audioPath: string,
    options?: { language?: string; referenceScript?: string }
  ): Promise<SttResult> {
    if (!this.apiKey) throw new Error("Gemini API key is required for Gemini Audio STT");

    const fileBytes = await readFile(audioPath);
    const fileName = basename(audioPath) || "audio.mp3";
    const mimeType = fileName.endsWith(".wav") ? "audio/wav" : "audio/mp3";
    const base64Audio = fileBytes.toString("base64");

    const promptText =
      "Transcribe this spoken Vietnamese audio accurately with segment timestamps. " +
      (options?.referenceScript ? `Reference script for terminology: "${options.referenceScript.slice(0, 300)}". ` : "") +
      "Output strictly valid JSON matching this schema: " +
      '{"text": string, "segments": [{"startSec": number, "endSec": number, "text": string}]}. ' +
      "Do not include markdown backticks or explanations.";

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const response = await axios.post(
      url,
      {
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Audio,
                },
              },
              {
                text: promptText,
              },
            ],
          },
        ],
        generationConfig: {
          response_mime_type: "application/json",
          temperature: 0.1,
        },
      },
      { timeout: 120000 }
    );

    const rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error("Empty response from Gemini Audio STT");

    let parsed: any;
    try {
      const cleaned = rawText.replace(/^```json\s*/, "").replace(/\s*```$/, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (e: any) {
      throw new Error(`Failed to parse Gemini STT JSON: ${e.message}`);
    }

    const segments: SttSegment[] = (parsed.segments || []).map((s: any, idx: number) => ({
      id: idx + 1,
      startSec: Math.max(0, parseFloat(s.startSec || 0)),
      endSec: Math.max(0, parseFloat(s.endSec || 0)),
      text: (s.text || "").trim(),
    }));

    return {
      text: (parsed.text || segments.map((s) => s.text).join(" ")).trim(),
      segments,
      language: "vi",
      provider: "gemini",
      wordAccuracy: "unverified",
    };
  }
}

/**
 * Fake STT Provider for testing and deterministic mocking.
 */
export class FakeSttProvider implements SttProvider {
  readonly name = "fake";
  public callCount = 0;
  private mockResult: SttResult;

  constructor(mockResult?: Partial<SttResult>) {
    this.mockResult = {
      text: mockResult?.text || "AI không chỉ biết viết code.",
      segments: mockResult?.segments || [
        { id: 1, startSec: 0.0, endSec: 2.0, text: "AI không chỉ biết viết code." },
      ],
      words: mockResult?.words,
      language: mockResult?.language || "vi",
      provider: "fake",
      wordAccuracy: mockResult?.wordAccuracy || "model-estimated",
    };
  }

  async transcribe(): Promise<SttResult> {
    this.callCount++;
    return this.mockResult;
  }
}

/**
 * Checks quality and semantic overlap between the STT transcript and reference script.
 * Validates against speech drift without assuming 100% forced alignment.
 */
export function verifyTranscriptMatch(
  sttText: string,
  referenceScript: string
): {
  matched: boolean;
  similarity: number;
  mismatchWarning?: string;
} {
  const normStt = normalizeText(sttText);
  const normRef = normalizeText(referenceScript);

  if (!normRef || !normStt) {
    return { matched: true, similarity: 1.0 };
  }

  const similarity = calculateTextOverlap(sttText, referenceScript);
  const matched = similarity >= 0.7;

  let mismatchWarning: string | undefined = undefined;
  if (!matched) {
    const pct = Math.round(similarity * 100);
    mismatchWarning = `Cảnh báo: Lời đọc kịch bản chỉ khớp ${pct}% với âm thanh nhận diện từ audio. Vui lòng kiểm tra lại file audio hoặc kịch bản.`;
    log.warn(`[STT Match] ${mismatchWarning}`);
  }

  return { matched, similarity, mismatchWarning };
}

/**
 * Factory to create the best available STT provider based on environment and config.
 */
export function createSttProvider(config?: SttConfig): SttProvider {
  if (config?.provider === "fake") {
    return new FakeSttProvider();
  }

  if (config?.provider === "groq" || (!config?.provider && process.env.GROQ_API_KEY)) {
    return new GroqWhisperProvider({
      apiKey: config?.apiKey || process.env.GROQ_API_KEY,
      model: config?.model,
      baseUrl: config?.baseUrl,
    });
  }

  if (config?.provider === "openai" || (!config?.provider && process.env.OPENAI_API_KEY)) {
    return new OpenAiWhisperProvider({
      apiKey: config?.apiKey || process.env.OPENAI_API_KEY,
      model: config?.model,
      baseUrl: config?.baseUrl,
    });
  }

  if (config?.provider === "gemini" || (!config?.provider && (process.env.GEMINI_API_KEY || process.env.LLM_API_KEY))) {
    return new GeminiAudioProvider({
      apiKey: config?.apiKey || process.env.GEMINI_API_KEY || process.env.LLM_API_KEY,
      model: config?.model,
    });
  }

  // Auto fallback to Gemini provider if available from config/llm.json
  try {
    const cfgPath = resolve("config/llm.json");
    if (existsSync(cfgPath)) {
      const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
      if (cfg.apiKey && cfg.provider === "gemini") {
        return new GeminiAudioProvider({
          apiKey: cfg.apiKey,
          model: cfg.model || "gemini-flash-lite-latest",
        });
      }
    }
  } catch {}

  throw new Error(
    "Không tìm thấy cấu hình STT hợp lệ (cần GROQ_API_KEY, OPENAI_API_KEY hoặc GEMINI_API_KEY)."
  );
}
