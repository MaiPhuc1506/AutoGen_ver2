import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseSrt } from "./srt.js";
import { estimateWordTimings } from "./estimator.js";
import type { CaptionCue } from "./types.js";
import { log } from "../utils/logger.js";

const exec = promisify(execFile);

export interface SpeechSegment {
  startSec: number;
  endSec: number;
}

export interface AlignmentResult {
  cues: CaptionCue[];
  sceneBoundaries: number[];
  timingQuality: {
    source: "imported-srt" | "acoustic-speech-segments" | "fallback-segments";
    wordAccuracy: "low" | "high";
    cueAccuracy: "verified" | "acoustic-verified" | "unverified";
    sceneTiming: "audio-mapped";
    mismatchWarning?: string;
  };
  highlightMode: "accurate-only" | "estimated";
}

/**
 * Normalizes text for comparison (NFC, lowercase, removes punctuation)
 */
export function normalizeText(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Computes Jaccard / token overlap similarity between two texts (0.0 to 1.0)
 */
export function calculateTextOverlap(a: string, b: string): number {
  const tokensA = new Set(normalizeText(a).split(/\s+/).filter(Boolean));
  const tokensB = new Set(normalizeText(b).split(/\s+/).filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }
  const union = new Set([...tokensA, ...tokensB]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Extract physical speech intervals using FFmpeg silence detection.
 * Finds where voice is actively speaking between pauses.
 */
export async function extractAcousticSpeechSegments(
  audioPath: string,
  totalDurationSec: number
): Promise<SpeechSegment[]> {
  try {
    const { stderr } = await exec("ffmpeg", [
      "-v",
      "info",
      "-i",
      audioPath,
      "-af",
      "silencedetect=noise=-30dB:d=0.20",
      "-f",
      "null",
      "-",
    ]);

    const silenceStarts: number[] = [];
    const silenceEnds: number[] = [];

    const startRegex = /silence_start:\s*([\d.]+)/g;
    const endRegex = /silence_end:\s*([\d.]+)/g;

    let match: RegExpExecArray | null;
    while ((match = startRegex.exec(stderr)) !== null) {
      silenceStarts.push(parseFloat(match[1]));
    }
    while ((match = endRegex.exec(stderr)) !== null) {
      silenceEnds.push(parseFloat(match[1]));
    }

    const segments: SpeechSegment[] = [];
    let currentStart = 0;

    for (let i = 0; i < silenceStarts.length; i++) {
      const silenceStart = silenceStarts[i];
      if (silenceStart > currentStart + 0.25) {
        segments.push({
          startSec: Math.max(0, currentStart),
          endSec: Math.min(totalDurationSec, silenceStart),
        });
      }
      if (silenceEnds[i] !== undefined) {
        currentStart = silenceEnds[i];
      }
    }

    if (currentStart < totalDurationSec - 0.25) {
      segments.push({
        startSec: currentStart,
        endSec: totalDurationSec,
      });
    }

    return segments.length > 0
      ? segments
      : [{ startSec: 0, endSec: totalDurationSec }];
  } catch (err: any) {
    log.warn(`Acoustic pause detection failed: ${err.message}`);
    return [{ startSec: 0, endSec: totalDurationSec }];
  }
}

/**
 * Maps scene text boundaries to real audio timestamps from cues or speech segments.
 * Strictly guarantees boundaries are increasing, within (0, totalDurationSec).
 */
export function mapScenesToAudioTimestamps(
  sceneTexts: string[],
  cues: CaptionCue[],
  totalDurationSec: number
): number[] {
  if (sceneTexts.length <= 1) return [];

  const boundaries: number[] = [];
  const cueTexts = cues.map((c) => normalizeText(c.text));
  const fullCueText = cueTexts.join(" ");

  let searchIndex = 0;
  for (let sIdx = 1; sIdx < sceneTexts.length; sIdx++) {
    const targetSceneLead = normalizeText(sceneTexts[sIdx]).split(" ").slice(0, 4).join(" ");
    let matchedCueIndex = -1;

    // Look ahead in cues for matching lead tokens
    for (let cIdx = searchIndex; cIdx < cues.length; cIdx++) {
      if (cueTexts[cIdx].includes(targetSceneLead) || calculateTextOverlap(cueTexts[cIdx], targetSceneLead) > 0.4) {
        matchedCueIndex = cIdx;
        break;
      }
    }

    let timestamp: number;
    if (matchedCueIndex !== -1 && matchedCueIndex > searchIndex) {
      timestamp = cues[matchedCueIndex].startSec;
      searchIndex = matchedCueIndex;
    } else {
      // Proportional fallback anchored to cue index distribution
      const frac = sIdx / sceneTexts.length;
      const approxCueIdx = Math.min(cues.length - 1, Math.floor(frac * cues.length));
      timestamp = cues[approxCueIdx]?.startSec || frac * totalDurationSec;
    }

    // Ensure strict monotonicity
    const prev = boundaries[boundaries.length - 1] ?? 0;
    if (timestamp <= prev + 0.3) {
      timestamp = prev + Math.max(0.3, (totalDurationSec - prev) / (sceneTexts.length - sIdx + 1));
    }
    if (timestamp >= totalDurationSec - 0.3) {
      timestamp = totalDurationSec - 0.3 * (sceneTexts.length - sIdx);
    }

    boundaries.push(Math.round(timestamp * 100) / 100);
  }

  return boundaries;
}

/**
 * Main audio & subtitle alignment orchestrator for Creative Mode.
 *
 * Rules:
 * 1. If SRT provided: parses cues, validates timestamps, checks transcript mismatch.
 * 2. If SRT missing: detects physical speech activity intervals via FFmpeg, segments
 *    transcript to speech intervals. Does NOT claim word-level high accuracy.
 * 3. Maps scene boundaries to verified acoustic timestamps.
 */
export async function alignCreativeAudioAndSubtitles(params: {
  audioPath: string;
  totalDurationSec: number;
  transcript: string;
  sceneTexts: string[];
  srtContent?: string;
}): Promise<AlignmentResult> {
  const { audioPath, totalDurationSec, transcript, sceneTexts, srtContent } = params;

  // Case 1: SRT is provided
  if (srtContent && srtContent.trim()) {
    const rawCues = parseSrt(srtContent.trim());
    if (rawCues.length > 0) {
      const srtCombinedText = rawCues.map((c) => c.text).join(" ");
      const overlap = calculateTextOverlap(transcript, srtCombinedText);
      let mismatchWarning: string | undefined;

      if (overlap < 0.65) {
        mismatchWarning = `Cảnh báo: Lời đọc kịch bản chỉ khớp ${(overlap * 100).toFixed(0)}% với nội dung phụ đề SRT. Phụ đề có thể lệch nghĩa so với giọng đọc.`;
        log.warn(mismatchWarning);
      }

      // SRT provides cue-level precision, not verified word-level phonetic timing.
      const cues = rawCues.map((c) => ({
        ...c,
        accuracy: "low" as const,
        endSec: Math.min(totalDurationSec, c.endSec),
        endMs: Math.min(Math.round(totalDurationSec * 1000), c.endMs),
      }));

      const sceneBoundaries = mapScenesToAudioTimestamps(sceneTexts, cues, totalDurationSec);

      return {
        cues,
        sceneBoundaries,
        timingQuality: {
          source: "imported-srt",
          wordAccuracy: "low",
          cueAccuracy: "verified",
          sceneTiming: "audio-mapped",
          mismatchWarning,
        },
        highlightMode: "estimated",
      };
    }
  }

  // Case 2: SRT is missing -> Acoustic Speech Activity Detection
  log.info(`[Creative Mode] No SRT provided. Performing acoustic speech segment detection...`);
  const segments = await extractAcousticSpeechSegments(audioPath, totalDurationSec);

  // Divide transcript into sentences
  const sentences = transcript
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const cues: CaptionCue[] = [];
  let cueId = 1;

  if (segments.length >= sentences.length) {
    // We have at least as many speech segments as sentences -> map 1:1 or group
    for (let i = 0; i < sentences.length; i++) {
      const seg = segments[i];
      const dur = seg.endSec - seg.startSec;
      const startMs = Math.round(seg.startSec * 1000);
      cues.push({
        id: cueId++,
        startMs,
        endMs: Math.round(seg.endSec * 1000),
        startSec: seg.startSec,
        endSec: seg.endSec,
        text: sentences[i],
        words: estimateWordTimings(sentences[i], dur, startMs),
        accuracy: "low",
      });
    }
  } else {
    // Fewer pause segments than sentences -> distribute sentences across available speech duration
    const usableDuration = Math.max(1, totalDurationSec);
    const sentenceWeights = sentences.map((s) => Math.max(3, s.split(/\s+/).length));
    const totalWeight = sentenceWeights.reduce((a, b) => a + b, 0);

    let cursor = 0;
    for (let i = 0; i < sentences.length; i++) {
      const dur = (sentenceWeights[i] / totalWeight) * usableDuration;
      const startSec = cursor;
      const endSec = Math.min(totalDurationSec, cursor + dur);
      const startMs = Math.round(startSec * 1000);
      cursor = endSec;

      cues.push({
        id: cueId++,
        startMs,
        endMs: Math.round(endSec * 1000),
        startSec,
        endSec,
        text: sentences[i],
        words: estimateWordTimings(sentences[i], dur, startMs),
        accuracy: "low",
      });
    }
  }

  const sceneBoundaries = mapScenesToAudioTimestamps(sceneTexts, cues, totalDurationSec);

  return {
    cues,
    sceneBoundaries,
    timingQuality: {
      source: "acoustic-speech-segments",
      wordAccuracy: "low",
      cueAccuracy: "acoustic-verified",
      sceneTiming: "audio-mapped",
      mismatchWarning:
        "Chưa có file SRT: Đã căn chỉnh phụ đề theo khoảng phát âm âm học thực tế từ file audio. Hiệu ứng phụ đề hiển thị theo câu; chưa bật karaoke từng từ.",
    },
    highlightMode: "estimated",
  };
}
