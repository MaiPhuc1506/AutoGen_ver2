/**
 * Caption and timing data structures for Auto_GenVid (M1).
 */

export interface TimedWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface CaptionCue {
  id: number;
  startMs: number;
  endMs: number;
  startSec: number;
  endSec: number;
  text: string;
  words: TimedWord[];
  accuracy?: "high" | "low" | "model-estimated" | "unverified" | "verified";
}

export interface TimingExtractionResult {
  accuracy: "high" | "low" | "model-estimated" | "unverified" | "verified";
  words: TimedWord[];
}

/**
 * Format milliseconds into standard SRT timestamp HH:MM:SS,mmm
 */
export function formatSrtTime(ms: number): string {
  const safeMs = Math.max(0, Math.round(ms));
  const hours = Math.floor(safeMs / 3_600_000);
  const minutes = Math.floor((safeMs % 3_600_000) / 60_000);
  const seconds = Math.floor((safeMs % 60_000) / 1000);
  const milliseconds = safeMs % 1000;

  const pad = (n: number, len = 2) => n.toString().padStart(len, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(milliseconds, 3)}`;
}

/**
 * Parse standard SRT timestamp HH:MM:SS,mmm (or HH:MM:SS.mmm) into milliseconds
 */
export function parseSrtTime(str: string): number {
  const match = str.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!match) {
    throw new Error(`Invalid SRT timestamp format: "${str}". Expected HH:MM:SS,mmm`);
  }
  const [, h, m, s, ms] = match;
  return (
    parseInt(h, 10) * 3_600_000 +
    parseInt(m, 10) * 60_000 +
    parseInt(s, 10) * 1000 +
    parseInt(ms, 10)
  );
}

