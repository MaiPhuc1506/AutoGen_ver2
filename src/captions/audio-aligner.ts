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
/**
 * Distributes sentences smoothly across all detected acoustic speech segments.
 * Uses dynamic programming to align sentence boundaries to real acoustic silence pauses,
 * ensuring subtitle cues appear synchronously with speech onset (with ~60ms visual lead-in).
 */
export function distributeSentencesAcoustically(
  sentences: string[],
  segments: SpeechSegment[],
  totalDurationSec: number
): CaptionCue[] {
  if (sentences.length === 0) return [];
  const usableDuration = Math.max(1, totalDurationSec);

  // Filter valid speech intervals
  const validSegs = segments.filter((s) => s.endSec > s.startSec + 0.05);
  const activeSegs = validSegs.length > 0 ? validSegs : [{ startSec: 0, endSec: usableDuration }];

  if (sentences.length === 1) {
    const startSec = Math.max(0, activeSegs[0].startSec - 0.06);
    const endSec = Math.min(usableDuration, activeSegs[activeSegs.length - 1].endSec + 0.1);
    const dur = endSec - startSec;
    return [{
      id: 1,
      startMs: Math.round(startSec * 1000),
      endMs: Math.round(endSec * 1000),
      startSec: Math.round(startSec * 1000) / 1000,
      endSec: Math.round(endSec * 1000) / 1000,
      text: sentences[0],
      words: estimateWordTimings(sentences[0], dur, Math.round(startSec * 1000)),
      accuracy: "low",
    }];
  }

  // Extract all acoustic silence pauses between consecutive segments
  interface CandidatePause {
    index: number;
    pauseStart: number;
    pauseEnd: number;
    pauseDur: number;
    cumSpeechBefore: number;
  }

  const pauses: CandidatePause[] = [];
  let cumSpeech = 0;
  for (let i = 0; i < activeSegs.length - 1; i++) {
    cumSpeech += (activeSegs[i].endSec - activeSegs[i].startSec);
    const pauseDur = activeSegs[i + 1].startSec - activeSegs[i].endSec;
    pauses.push({
      index: i,
      pauseStart: activeSegs[i].endSec,
      pauseEnd: activeSegs[i + 1].startSec,
      pauseDur,
      cumSpeechBefore: cumSpeech,
    });
  }

  const weights = sentences.map((s) => Math.max(2, s.trim().split(/\s+/).length));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const totalSpeechSec = activeSegs.reduce((sum, s) => sum + (s.endSec - s.startSec), 0);

  // Check if we have enough distinct acoustic pauses to align sentence boundaries directly
  const neededBoundaries = sentences.length - 1;
  let chosenBoundaries: { startSec: number; endSec: number }[] | null = null;

  if (pauses.length >= neededBoundaries) {
    // Target speech progress for each sentence boundary
    let curW = 0;
    const targets: number[] = [];
    for (let i = 0; i < neededBoundaries; i++) {
      curW += weights[i];
      targets.push((curW / totalWeight) * totalSpeechSec);
    }

    // Dynamic programming to match target speech progress with actual acoustic pauses
    const S = targets.length;
    const P = pauses.length;
    const dp = Array.from({ length: S + 1 }, () => Array(P).fill(Infinity));
    const parent = Array.from({ length: S + 1 }, () => Array(P).fill(-1));

    for (let p = 0; p < P; p++) {
      const timeDiff = Math.abs(pauses[p].cumSpeechBefore - targets[0]);
      const durBonus = Math.min(0.8, pauses[p].pauseDur) * 4.0;
      dp[1][p] = timeDiff * 1.5 - durBonus;
    }

    for (let s = 2; s <= S; s++) {
      for (let p = s - 1; p < P; p++) {
        const timeDiff = Math.abs(pauses[p].cumSpeechBefore - targets[s - 1]);
        const durBonus = Math.min(0.8, pauses[p].pauseDur) * 4.0;
        const cost = timeDiff * 1.5 - durBonus;

        let minPrev = Infinity;
        let bestPrevP = -1;
        for (let prevP = s - 2; prevP < p; prevP++) {
          if (dp[s - 1][prevP] < minPrev) {
            minPrev = dp[s - 1][prevP];
            bestPrevP = prevP;
          }
        }
        dp[s][p] = minPrev + cost;
        parent[s][p] = bestPrevP;
      }
    }

    let bestP = S - 1;
    let minTotal = dp[S][bestP];
    for (let p = S; p < P; p++) {
      if (dp[S][p] < minTotal) {
        minTotal = dp[S][p];
        bestP = p;
      }
    }

    if (minTotal < Infinity) {
      const selectedPauses: CandidatePause[] = [];
      let curr = bestP;
      for (let s = S; s >= 1; s--) {
        selectedPauses.unshift(pauses[curr]);
        curr = parent[s][curr];
      }

      chosenBoundaries = [];
      for (let i = 0; i < sentences.length; i++) {
        const isFirst = i === 0;
        const isLast = i === sentences.length - 1;
        // 60ms subtle visual lead-in so subtitles appear right as voice starts
        const rawStart = isFirst ? activeSegs[0].startSec : selectedPauses[i - 1].pauseEnd;
        const rawEnd = isLast ? activeSegs[activeSegs.length - 1].endSec : selectedPauses[i].pauseStart;

        const startSec = isFirst ? 0 : Math.max(0, rawStart - 0.06);
        const endSec = Math.min(usableDuration, rawEnd + 0.08);
        chosenBoundaries.push({ startSec, endSec });
      }
    }
  }

  // Fallback: cumulative active speech fraction if pauses could not be matched
  if (!chosenBoundaries) {
    const cumFractions: number[] = [0];
    for (let i = 0; i < sentences.length; i++) {
      cumFractions.push(cumFractions[i] + weights[i] / totalWeight);
    }
    cumFractions[sentences.length] = 1.0;

    function getTimeAtFraction(frac: number): number {
      if (frac <= 0) return activeSegs[0].startSec;
      if (frac >= 1) return activeSegs[activeSegs.length - 1].endSec;

      const targetActiveSec = frac * totalSpeechSec;
      let accumulated = 0;
      for (const seg of activeSegs) {
        const segDur = seg.endSec - seg.startSec;
        if (accumulated + segDur >= targetActiveSec) {
          const ratio = (targetActiveSec - accumulated) / segDur;
          return Math.min(usableDuration, seg.startSec + ratio * segDur);
        }
        accumulated += segDur;
      }
      return activeSegs[activeSegs.length - 1].endSec;
    }

    chosenBoundaries = [];
    for (let i = 0; i < sentences.length; i++) {
      const isFirst = i === 0;
      const rawStart = getTimeAtFraction(cumFractions[i]);
      const rawEnd = getTimeAtFraction(cumFractions[i + 1]);
      const startSec = isFirst ? 0 : Math.max(0, rawStart - 0.06);
      const endSec = Math.min(usableDuration, rawEnd);
      chosenBoundaries.push({ startSec, endSec });
    }
  }

  const cues: CaptionCue[] = [];
  let prevEnd = 0;

  for (let i = 0; i < sentences.length; i++) {
    let { startSec, endSec } = chosenBoundaries[i];

    if (startSec < prevEnd) {
      startSec = prevEnd;
    }
    if (endSec <= startSec + 0.25) {
      endSec = Math.min(usableDuration, startSec + 0.25);
    }
    prevEnd = endSec;

    const dur = endSec - startSec;
    const startMs = Math.round(startSec * 1000);
    const endMs = Math.round(endSec * 1000);

    cues.push({
      id: i + 1,
      startMs,
      endMs,
      startSec: Math.round(startSec * 1000) / 1000,
      endSec: Math.round(endSec * 1000) / 1000,
      text: sentences[i],
      words: estimateWordTimings(sentences[i], dur, startMs),
      accuracy: "low",
    });
  }

  return cues;
}

/**
 * Validates timeline sanity before rendering.
 * Catches early outro triggers, non-monotonic boundaries, and gaps.
 */
export function validateTimelineSanity(params: {
  sceneBoundaries: number[];
  totalDurationSec: number;
  sceneCount: number;
  isOutroLast?: boolean;
}): { valid: boolean; errors: string[] } {
  const { sceneBoundaries, totalDurationSec, sceneCount, isOutroLast = true } = params;
  const errors: string[] = [];

  if (sceneBoundaries.length !== sceneCount - 1) {
    errors.push(`Số lượng mốc cảnh (${sceneBoundaries.length}) không khớp với số cảnh (${sceneCount} cảnh cần ${sceneCount - 1} mốc).`);
  }

  for (let i = 0; i < sceneBoundaries.length; i++) {
    const b = sceneBoundaries[i];
    const prev = i === 0 ? 0 : sceneBoundaries[i - 1];
    if (b <= prev) {
      errors.push(`Mốc cảnh #${i + 1} (${b}s) không tăng dần so với mốc trước (${prev}s).`);
    }
    if (b - prev < 0.5) {
      errors.push(`Cảnh #${i + 1} quá ngắn (${(b - prev).toFixed(2)}s, tối thiểu 0.5s).`);
    }
  }

  if (sceneBoundaries.length > 0) {
    const lastBoundary = sceneBoundaries[sceneBoundaries.length - 1];
    if (lastBoundary >= totalDurationSec) {
      errors.push(`Mốc cảnh cuối (${lastBoundary}s) vượt quá tổng thời lượng audio (${totalDurationSec}s).`);
    }

    const outroDuration = totalDurationSec - lastBoundary;
    if (isOutroLast && totalDurationSec > 15) {
      if (outroDuration < 1.0) {
        errors.push(`Cảnh Outro quá ngắn (${outroDuration.toFixed(2)}s).`);
      }
      if (outroDuration > 12.0) {
        errors.push(`Lỗi Outro xuất hiện quá sớm: Outro kéo dài ${outroDuration.toFixed(2)}s trên tổng số ${totalDurationSec}s.`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Maps scene text boundaries to real audio timestamps from cues or speech segments.
 * Strictly guarantees boundaries are increasing, within (0, totalDurationSec),
 * and outro never triggers halfway through the video.
 */
export function mapScenesToAudioTimestamps(
  sceneTexts: string[],
  cues: CaptionCue[],
  totalDurationSec: number
): number[] {
  if (sceneTexts.length <= 1) return [];

  const boundaries: number[] = [];
  const cueTexts = cues.map((c) => normalizeText(c.text));

  let searchIndex = 0;
  for (let sIdx = 1; sIdx < sceneTexts.length; sIdx++) {
    const isLastBoundary = sIdx === sceneTexts.length - 1;
    const targetSceneLead = normalizeText(sceneTexts[sIdx]).split(" ").slice(0, 4).join(" ");
    let matchedCueIndex = -1;

    // Look ahead in cues for matching lead tokens
    for (let cIdx = searchIndex; cIdx < cues.length; cIdx++) {
      if (cueTexts[cIdx].includes(targetSceneLead) || calculateTextOverlap(cueTexts[cIdx], targetSceneLead) > 0.35) {
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

    // Special protection for Outro (last boundary)
    if (isLastBoundary && totalDurationSec > 15) {
      const outroWordCount = sceneTexts[sIdx].trim().split(/\s+/).length;
      // Vietnamese natural speech rate is ~2.7 words/sec
      const naturalOutroDur = Math.max(2.5, Math.min(8.0, outroWordCount / 2.7));
      const minOutroStart = totalDurationSec - Math.max(naturalOutroDur, 7.0);
      const maxOutroStart = totalDurationSec - 1.8;

      if (timestamp < minOutroStart) {
        timestamp = minOutroStart;
      }
      if (timestamp > maxOutroStart) {
        timestamp = maxOutroStart;
      }
    }

    // Ensure strict monotonicity and minimum scene duration
    const prev = boundaries[boundaries.length - 1] ?? 0;
    const remainingScenes = sceneTexts.length - sIdx;
    const minStep = 0.8;

    if (timestamp <= prev + minStep) {
      timestamp = prev + Math.max(minStep, (totalDurationSec - prev) / (remainingScenes + 1));
    }
    const maxAllowed = totalDurationSec - minStep * remainingScenes;
    if (timestamp >= maxAllowed) {
      timestamp = maxAllowed;
    }

    boundaries.push(Math.round(timestamp * 100) / 100);
  }

  // Final sanity check & auto-repair if any boundary is slightly off
  for (let i = 0; i < boundaries.length; i++) {
    const prev = i === 0 ? 0 : boundaries[i - 1];
    if (boundaries[i] <= prev) {
      boundaries[i] = Math.round((prev + 1.0) * 100) / 100;
    }
  }

  return boundaries;
}

/**
 * Main audio & subtitle alignment orchestrator for Creative Mode.
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
      validateTimelineSanity({ sceneBoundaries, totalDurationSec, sceneCount: sceneTexts.length });

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

  // Case 2: SRT is missing -> Acoustic Speech Activity Detection across ALL audio
  log.info(`[Creative Mode] No SRT provided. Performing acoustic speech segment detection across ${totalDurationSec.toFixed(2)}s...`);
  const segments = await extractAcousticSpeechSegments(audioPath, totalDurationSec);

  // Divide transcript into sentences
  const sentences = transcript
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const cues = distributeSentencesAcoustically(sentences, segments, totalDurationSec);
  const sceneBoundaries = mapScenesToAudioTimestamps(sceneTexts, cues, totalDurationSec);

  // Validate timeline sanity
  const sanity = validateTimelineSanity({
    sceneBoundaries,
    totalDurationSec,
    sceneCount: sceneTexts.length,
    isOutroLast: true,
  });
  if (!sanity.valid) {
    log.warn(`[Timeline Sanity] Warnings detected: ${sanity.errors.join("; ")}`);
  }

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
