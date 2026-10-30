import { CaptionCue, TimedWord } from "./types.js";

export interface GroupingOptions {
  sceneStartMs?: number;
  minWordsPerCue?: number;
  maxWordsPerCue?: number;
  minDurationMs?: number;
  maxCharsPerCue?: number;
  maxGapMs?:number;
}

const DEFAULT_OPTIONS: Required<GroupingOptions> = {
  sceneStartMs: 0,
  maxGapMs:300,
  minWordsPerCue: 2,
  maxWordsPerCue: 5,
  minDurationMs: 400, // 0.4s minimum duration per cue
  maxCharsPerCue: 35, // fits neatly across 1-2 lines on 1080x1920
};

/**
 * Group sequential TimedWords into natural, readable CaptionCues.
 *
 * Rules:
 * - 2 to 6 words per cue
 * - Minimum duration: ~400ms (0.4s)
 * - Punctuation break on [.?!;:]
 * - Max ~35 characters per cue
 * - Preserves exact startMs of first word and endMs of last word (deviation = 0ms)
 * - Offsets all timestamps by sceneStartMs
 * - Normalizes Unicode NFC
 */
export function groupWordsIntoCues(
  words: TimedWord[],
  opts?: GroupingOptions,
  startingCueId = 1
): CaptionCue[] {
  if (words.length === 0) return [];

  const config = { ...DEFAULT_OPTIONS, ...opts };
  const cues: CaptionCue[] = [];
  let currentGroup: TimedWord[] = [];
  let cueId = startingCueId;

  const flushGroup = () => {
    if (currentGroup.length === 0) return;

    const firstWord = currentGroup[0];
    const lastWord = currentGroup[currentGroup.length - 1];

    const rawStart = firstWord.startMs + config.sceneStartMs;
    const rawEnd = Math.max(
      lastWord.endMs + config.sceneStartMs,
      rawStart + config.minDurationMs
    );

    const text = currentGroup
      .map((w) => w.text)
      .join(" ")
      .normalize("NFC")
      .trim();

    const shiftedWords: TimedWord[] = currentGroup.map((w) => ({
      text: w.text.normalize("NFC"),
      startMs: w.startMs + config.sceneStartMs,
      endMs: w.endMs + config.sceneStartMs,
    }));

    cues.push({
      id: cueId++,
      startMs: rawStart,
      endMs: rawEnd,
      startSec: rawStart / 1000,
      endSec: rawEnd / 1000,
      text,
      words: shiftedWords,
      accuracy: "high",
    });

    currentGroup = [];
  };

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if(currentGroup.length&&word.startMs-currentGroup[currentGroup.length-1].endMs>config.maxGapMs)flushGroup();
    currentGroup.push(word);

    const groupText = currentGroup.map((w) => w.text).join(" ");
    const wordCount = currentGroup.length;
    const isPunctuationEnding = /[.?!;:]$/.test(word.text);
    const durationSoFar =
      word.endMs - currentGroup[0].startMs;

    // Check if we should break:
    // 1. Hit strong punctuation and have at least minWordsPerCue (or is last word)
    // 2. Reached maxWordsPerCue
    // 3. Exceeded maxCharsPerCue
    const shouldBreak =
      isPunctuationEnding ||
      wordCount >= config.maxWordsPerCue ||
      (groupText.length >= config.maxCharsPerCue && wordCount >= config.minWordsPerCue) ||
      i === words.length - 1;

    if (shouldBreak) {
      // Ensure cue meets minimum duration if next word exists and current cue is too short
      if (
        durationSoFar < config.minDurationMs &&
        i < words.length - 1 &&
        wordCount < config.maxWordsPerCue + 2 &&
        !isPunctuationEnding
      ) {
        continue;
      }
      flushGroup();
    }
  }

  return cues;
}

