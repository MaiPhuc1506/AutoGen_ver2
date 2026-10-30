import { spawn } from "node:child_process";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

function run(cmd: string, args: string[], capture: 'stdout'|'stderr' = 'stdout'): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    let out = "", err = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.stderr.on("data", (d) => (err += d.toString()));
    proc.on("close", (code) => {
      if (code === 0) resolve(capture === 'stderr' ? err : out);
      else reject(new Error(`${cmd} failed (exit ${code}): ${err}`));
    });
    proc.on("error", reject);
  });
}

export async function getDurationSec(path: string): Promise<number> {
  const out = await run("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    path,
  ]);
  const d = parseFloat(out.trim());
  if (isNaN(d)) throw new Error(`ffprobe returned non-numeric duration for ${path}: ${out}`);
  return d;
}

/**
 * Concatenate audio files with `gapSec` silence between each, producing a single
 * output mp3.
 *
 * Uses ffmpeg's CONCAT FILTER (not concat demuxer) with explicit sample-rate /
 * channel normalization to avoid clicks/pops at boundaries. Each input is also
 * given a tiny 8 ms fade-in/fade-out which inaudibly smooths any DC offset
 * discontinuity at the boundary — this eliminates the "pét" clicking sound.
 */
export async function concatWithSilence(
  inputPaths: string[],
  gapSec: number,
  outPath: string,
): Promise<void> {
  if (inputPaths.length === 0) throw new Error("concatWithSilence: empty inputPaths");
  if (inputPaths.length === 1) {
    // No concat needed — just normalize the single file
    await run("ffmpeg", [
      "-y", "-i", inputPaths[0],
      "-ar", "44100", "-ac", "1",
      "-c:a", "libmp3lame", "-b:a", "192k",
      outPath,
    ]);
    return;
  }

  const tmp = await mkdtemp(join(tmpdir(), "concat-"));
  try {
    // Generate WAV silence (lossless, no encoder priming pops)
    const silencePath = join(tmp, "silence.wav");
    await run("ffmpeg", [
      "-y", "-f", "lavfi",
      "-i", `anullsrc=r=44100:cl=mono`,
      "-t", String(gapSec),
      "-ac", "1", "-ar", "44100",
      silencePath,
    ]);

    // Build ffmpeg input args + concat filter graph.
    // We interleave: voice[0] silence voice[1] silence voice[2] ... voice[N-1]
    // Each is fed through a chain that:
    //   1) resamples to 44100 mono (aresample with high-quality)
    //   2) applies a tiny 8ms fade-in + fade-out (inaudible but smooths boundary)
    // Then all are concatenated by the `concat=n=K:v=0:a=1` filter.
    const ffArgs: string[] = ["-y"];
    const filterParts: string[] = [];
    const labels: string[] = [];
    let idx = 0;
    const FADE_SEC = 0.008; // 8ms — inaudible

    const addInput = (path: string) => {
      ffArgs.push("-i", path);
      const inLabel = `[${idx}:a]`;
      const outLabel = `a${idx}`;
      // Pre-pad: we cannot know exact duration here without probing every input,
      // so use afade with `t=in/out:st=...` and rely on `acrossfade` style.
      // Simpler robust trick: use afade `st` for in, and `afade=t=out` with
      // start_time=eof-FADE_SEC by providing duration after `-t` is hard.
      // Use `afade=t=in:st=0:d=FADE` then `afade=t=out:st=0:d=FADE` won't work
      // for variable-length inputs. So we use `apad=pad_dur=0` (no-op) +
      // `aresample` then rely on concat filter doing sample-accurate join.
      // The micro-fade is applied via `areverse,afade,areverse` trick to fade out:
      filterParts.push(
        `${inLabel}aresample=44100,aformat=sample_fmts=fltp:channel_layouts=mono,` +
        `afade=t=in:st=0:d=${FADE_SEC},` +
        // Trim fade-out: reverse → fade-in → reverse (this fades the END)
        `areverse,afade=t=in:st=0:d=${FADE_SEC},areverse[${outLabel}]`
      );
      labels.push(`[${outLabel}]`);
      idx++;
    };

    inputPaths.forEach((p, i) => {
      addInput(p);
      if (i < inputPaths.length - 1) addInput(silencePath);
    });

    const concatFilter = `${labels.join("")}concat=n=${labels.length}:v=0:a=1[out]`;
    const filterGraph = `${filterParts.join(";")};${concatFilter}`;

    ffArgs.push(
      "-filter_complex", filterGraph,
      "-map", "[out]",
      "-c:a", "libmp3lame", "-b:a", "192k", "-ar", "44100",
      outPath,
    );

    await run("ffmpeg", ffArgs);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

export interface SfxMixSpec {
  /** Absolute path to SFX mp3/wav file */
  path: string;
  /** Time in seconds (within voice.mp3) when SFX starts */
  startSec: number;
  /** Volume 0–1 */
  volume: number;
}

/**
 * Mix SFX layer onto an existing voice mp3.
 *
 * - Voice stays at full volume
 * - Each SFX is delayed to its `startSec` and scaled by its `volume`
 * - All SFX layers are summed, then mixed with voice (amix duration=first)
 * - Output is mp3 at 192kbps
 *
 * If `sfxList` is empty, just copies voicePath → outPath.
 */
export async function mixSfxOntoVoice(
  voicePath: string,
  sfxList: SfxMixSpec[],
  outPath: string,
): Promise<void> {
  if (sfxList.length === 0) {
    // No SFX — just normalize/copy voice
    await run("ffmpeg", [
      "-y", "-i", voicePath,
      "-c:a", "libmp3lame", "-b:a", "192k", "-ar", "44100",
      outPath,
    ]);
    return;
  }

  const ffArgs: string[] = ["-y", "-i", voicePath];
  const filterParts: string[] = [];
  const sfxLabels: string[] = [];

  sfxList.forEach((s, i) => {
    ffArgs.push("-i", s.path);
    const inputIdx = i + 1; // voice is index 0
    const outLabel = `s${i}`;
    const delayMs = Math.max(0, Math.round(s.startSec * 1000));
    // Per-SFX chain: resample to 44100 mono → adelay to start time → volume
    filterParts.push(
      `[${inputIdx}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=mono,` +
      `adelay=${delayMs}|${delayMs},volume=${s.volume}[${outLabel}]`
    );
    sfxLabels.push(`[${outLabel}]`);
  });

  // Mix all SFX layers together
  let mixedSfxLabel: string;
  if (sfxLabels.length === 1) {
    mixedSfxLabel = sfxLabels[0];
  } else {
    filterParts.push(
      `${sfxLabels.join("")}amix=inputs=${sfxLabels.length}:dropout_transition=0:normalize=0[sfxall]`
    );
    mixedSfxLabel = "[sfxall]";
  }

  // Voice path: resample, then mix with SFX layer (voice volume 1.0, SFX already scaled)
  filterParts.push(
    `[0:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=mono[voice]`
  );
  filterParts.push(
    `[voice]${mixedSfxLabel}amix=inputs=2:duration=first:dropout_transition=0:normalize=0[out]`
  );

  ffArgs.push(
    "-filter_complex", filterParts.join(";"),
    "-map", "[out]",
    "-c:a", "libmp3lame", "-b:a", "192k", "-ar", "44100",
    outPath,
  );

  await run("ffmpeg", ffArgs);
}

export interface BgmMixOptions {
  /** Base volume for BGM (0 to 1, default 0.18) */
  volume?: number;
  /** Whether to duck BGM when voice is active (default true) */
  duck?: boolean;
  /** Ducked volume when speech is active (default 0.06) */
  duckVolume?: number;
  /** Extend the bed through the final visual hold, without cutting narration. */
  durationSec?: number;
}

async function meanVolumeDb(path: string): Promise<number> {
  const report = await run('ffmpeg', ['-hide_banner','-nostats','-i',path,'-af','volumedetect','-vn','-sn','-dn','-f','null','-'], 'stderr');
  const value = report.match(/mean_volume:\s*(-?[\d.]+|-inf)\s*dB/);
  if (!value) throw new Error('Không đo được mức âm thanh để cân nhạc nền.');
  return Number(value[1]);
}

/**
 * Mixes background music (BGM) with voice audio.
 * - Loops BGM seamlessly if voice duration is longer than BGM
 * - Fades in at start (1.0s) and fades out at end (1.5s)
 * - If duck is true: applies sidechain compression / ducking so BGM dips down when voice plays
 * - Matches exact voice audio duration
 */
export async function mixBgmWithVoice(
  voicePath: string,
  bgmPath: string,
  outPath: string,
  opts: BgmMixOptions = {},
): Promise<void> {
  const baseVolume = opts.volume ?? 0.18;
  const duck = opts.duck ?? true;

  const voiceDur = await getDurationSec(voicePath);
  const totalDur = Math.max(voiceDur, opts.durationSec ?? voiceDur);
  const fadeOutStart = Math.max(0, totalDur - 1.5);
  // Match source levels before applying the user's quiet music ratio. A loud
  // replacement track cannot unexpectedly drown out a quiet narrator.
  const [voiceDb, musicDb] = await Promise.all([meanVolumeDb(voicePath), meanVolumeDb(bgmPath)]);
  if (!Number.isFinite(musicDb)) throw new Error('File nhạc nền không có âm thanh.');
  const levelGain = Number.isFinite(voiceDb) ? Math.min(64, Math.pow(10, (voiceDb-musicDb)/20)) : 0;
  const duckVolume = Math.min(baseVolume, Math.max(0, opts.duckVolume ?? 0.06));
  const musicFilter = `[1:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${levelGain},afade=t=in:st=0:d=1.0,afade=t=out:st=${fadeOutStart.toFixed(3)}:d=1.5`;
  const voiceFilter = `[0:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${totalDur}`;

  const ffArgs: string[] = [
    "-y",
    "-i", voicePath,
    "-stream_loop", "-1",
    "-i", bgmPath,
  ];

  let filterGraph: string;
  if (duck) {
    filterGraph = [
      `${musicFilter},asplit=2[music_floor_source][music_duck_source]`,
      `[music_floor_source]volume=${duckVolume}[music_floor]`,
      `[music_duck_source]volume=${baseVolume-duckVolume}[music_dynamic]`,
      `${voiceFilter},asplit=2[voice_main][voice_side]`,
      `[music_dynamic][voice_side]sidechaincompress=threshold=0.015:ratio=12:attack=10:release=350[bgm_ducked]`,
      `[voice_main][music_floor][bgm_ducked]amix=inputs=3:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95:level=false:latency=true[out]`,
    ].join(";");
  } else {
    filterGraph = [
      `${musicFilter},volume=${baseVolume}[bgm_raw]`,
      `${voiceFilter}[voice_raw]`,
      `[voice_raw][bgm_raw]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95:level=false:latency=true[out]`,
    ].join(";");
  }

  ffArgs.push(
    "-filter_complex", filterGraph,
    "-map", "[out]",
    "-t", totalDur.toFixed(2),
    "-c:a", "libmp3lame", "-b:a", "192k", "-ar", "44100",
    outPath,
  );

  await run("ffmpeg", ffArgs);
}
