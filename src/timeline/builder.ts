import type { Script } from "../render/script-schema.js";
import type { TimelineClip, TimelineState, TimelineTrack } from "./types.js";
import { migrateV1toV2 } from "./migrate.js";

export function buildTimelineState(
  inputScript: Script,
  audioDurations?: Record<string, number>,
  captionCues?: Array<{ start: number; end: number; text: string }>
): TimelineState {
  const script = migrateV1toV2(inputScript, audioDurations);

  const sceneClips: TimelineClip[] = [];
  const voiceClips: TimelineClip[] = [];

  let maxTime = 0;

  for (const scene of script.scenes) {
    const timing = script.timeline?.scenes?.[scene.id] ?? {
      start: 0,
      duration: 3,
    };
    const start = timing.start ?? 0;
    const duration = timing.duration ?? 3;
    const end = start + duration;
    if (end > maxTime) maxTime = end;

    sceneClips.push({
      id: `scene-clip-${scene.id}`,
      trackId: "track-scenes",
      trackType: "scene",
      sceneId: scene.id,
      start,
      duration,
      offset: timing.trimIn ?? 0,
      name: `Scene: ${scene.templateData.template} (${scene.id})`,
      meta: {
        template: scene.templateData.template,
        type: scene.type,
      },
    });

    voiceClips.push({
      id: `voice-clip-${scene.id}`,
      trackId: "track-voice",
      trackType: "voice",
      sceneId: scene.id,
      start,
      duration,
      offset: 0,
      name: `Voice: ${scene.voiceText.slice(0, 20)}...`,
      meta: {
        text: scene.voiceText,
      },
    });
  }

  // Caption Track
  const cues =
    captionCues ??
    script.timeline?.captionCues ??
    [];

  const captionClips: TimelineClip[] = cues.map((cue, index) => {
    const start = cue.start;
    const duration = Math.max(0.1, cue.end - cue.start);
    if (cue.end > maxTime) maxTime = cue.end;

    return {
      id: `caption-clip-${index}`,
      trackId: "track-captions",
      trackType: "caption",
      cueIndex: index,
      start,
      duration,
      name: cue.text,
      meta: { text: cue.text },
    };
  });

  // BGM Track
  const bgmClips: TimelineClip[] = [];
  if (script.bgm?.src) {
    bgmClips.push({
      id: "bgm-clip-1",
      trackId: "track-bgm",
      trackType: "bgm",
      start: 0,
      duration: maxTime > 0 ? maxTime : 30,
      name: `BGM: ${script.bgm.src}`,
      meta: {
        volume: script.bgm.volume,
        duck: script.bgm.duck,
      },
    });
  }

  const tracks: TimelineTrack[] = [
    {
      id: "track-scenes",
      type: "scene",
      label: "Visual Scenes",
      clips: sceneClips,
    },
    {
      id: "track-voice",
      type: "voice",
      label: "Voice Track",
      clips: voiceClips,
    },
    {
      id: "track-captions",
      type: "caption",
      label: "Captions",
      clips: captionClips,
    },
    {
      id: "track-bgm",
      type: "bgm",
      label: "Background Music",
      clips: bgmClips,
    },
  ];

  return {
    totalDuration: Math.round(maxTime * 100) / 100,
    fps: 30,
    playhead: 0,
    tracks,
    selectedClipId: null,
    script,
  };
}

export function timelineStateToScript(state: TimelineState): Script {
  const script = JSON.parse(JSON.stringify(state.script)) as Script;
  const scenesTrack = state.tracks.find((t) => t.type === "scene");
  const captionsTrack = state.tracks.find((t) => t.type === "caption");

  if (!script.timeline) {
    script.timeline = {
      scenes: {},
      captionCues: [],
    };
  }

  if (scenesTrack) {
    const scenesTiming: Record<string, { start: number; duration: number; trimIn?: number; trimOut?: number }> = {};
    for (const clip of scenesTrack.clips) {
      if (clip.sceneId) {
        scenesTiming[clip.sceneId] = {
          start: Math.round(clip.start * 1000) / 1000,
          duration: Math.round(clip.duration * 1000) / 1000,
          trimIn: clip.offset ?? 0,
        };
      }
    }
    script.timeline.scenes = scenesTiming;
  }

  if (captionsTrack) {
    script.timeline.captionCues = captionsTrack.clips.map((clip) => ({
      start: Math.round(clip.start * 1000) / 1000,
      end: Math.round((clip.start + clip.duration) * 1000) / 1000,
      text: (clip.meta?.text as string) ?? clip.name,
    }));
  }

  return script;
}

/**
 * Builds a single canonical TimelineState strictly anchored to SRT cues and scenes.
 * Guarantees scene clips, captions, and visual events share identical deterministic timing data.
 */
export function buildCanonicalTimelineFromSrt(
  inputScript: Script,
  cues: Array<{ id?: number; startSec: number; endSec: number; text: string }>,
  totalDurationSec: number
): TimelineState {
  const script = JSON.parse(JSON.stringify(inputScript)) as Script;
  const cueMap = new Map<number, { id: number; startSec: number; endSec: number; text: string }>();
  cues.forEach((c, idx) => {
    const id = c.id ?? idx + 1;
    cueMap.set(id, { id, startSec: c.startSec, endSec: c.endSec, text: c.text });
  });

  const sceneClips: TimelineClip[] = [];
  const voiceClips: TimelineClip[] = [];
  const eventClips: TimelineClip[] = [];

  const boundaries = script.voice?.sceneBoundaries || [];
  let prevEnd = 0;

  for (let sIdx = 0; sIdx < script.scenes.length; sIdx++) {
    const scene = script.scenes[sIdx];
    const isFirst = sIdx === 0;
    const isLast = sIdx === script.scenes.length - 1;

    let start = isFirst ? 0 : prevEnd;
    let end: number;

    if (scene.cueRange) {
      const lastCue = cueMap.get(scene.cueRange.endCueId);
      if (isLast) {
        end = Math.max(start + 0.5, totalDurationSec);
      } else if (lastCue) {
        end = Math.max(start + 0.5, Math.min(totalDurationSec, lastCue.endSec));
      } else {
        end = boundaries[sIdx] ?? (start + 3.0);
      }
    } else if (boundaries.length >= script.scenes.length - 1) {
      end = isLast ? totalDurationSec : boundaries[sIdx];
    } else {
      end = isLast ? totalDurationSec : start + 3.0;
    }

    if (end <= start) {
      end = start + 0.5;
    }
    prevEnd = end;
    const duration = Math.round((end - start) * 1000) / 1000;

    sceneClips.push({
      id: `scene-clip-${scene.id}`,
      trackId: "track-scenes",
      trackType: "scene",
      sceneId: scene.id,
      start: Math.round(start * 1000) / 1000,
      duration,
      name: `Scene: ${scene.templateData.template} (${scene.id})`,
      meta: {
        template: scene.templateData.template,
        type: scene.type,
        semanticIntent: scene.semanticIntent,
        motionPreset: scene.motionPreset,
        motionIntensity: scene.motionIntensity,
        cueRange: scene.cueRange,
      },
    });

    voiceClips.push({
      id: `voice-clip-${scene.id}`,
      trackId: "track-voice",
      trackType: "voice",
      sceneId: scene.id,
      start: Math.round(start * 1000) / 1000,
      duration,
      name: `Voice: ${scene.voiceText.slice(0, 24)}...`,
      meta: { text: scene.voiceText },
    });

    // Visual events for this scene
    if (Array.isArray(scene.visualEvents)) {
      scene.visualEvents.forEach((ev, evIdx) => {
        let evStart = start;
        const targetCue = ev.targetCueId ? cueMap.get(ev.targetCueId) : undefined;

        if (ev.timingSource === "cue-start" && targetCue) {
          evStart = targetCue.startSec;
        } else if (ev.timingSource === "cue-end" && targetCue) {
          evStart = targetCue.endSec;
        } else if (ev.timingSource === "cue-middle" && targetCue) {
          evStart = (targetCue.startSec + targetCue.endSec) / 2;
        } else if (ev.timingSource === "explicit-sec" && ev.atSec !== undefined) {
          evStart = start + ev.atSec;
        }

        // Calculate and persist relative atSec directly on ev for HTML serialization
        const relAtSec = Math.round(Math.max(0.1, Math.min(duration - 0.2, evStart - start)) * 1000) / 1000;
        ev.atSec = relAtSec;
        if (inputScript.scenes[sIdx]?.visualEvents?.[evIdx]) {
          inputScript.scenes[sIdx].visualEvents![evIdx].atSec = relAtSec;
        }

        const evDur = ev.durationSec ?? 0.3;
        eventClips.push({
          id: `event-clip-${scene.id}-${evIdx}`,
          trackId: "track-events",
          trackType: "event",
          sceneId: scene.id,
          eventId: ev.id || `ev-${sIdx}-${evIdx}`,
          start: Math.round(evStart * 1000) / 1000,
          duration: Math.round(evDur * 1000) / 1000,
          name: `${ev.eventType} on ${ev.targetElement}`,
          meta: { ...ev },
        });
      });
    }
  }

  // Caption Track
  const captionClips: TimelineClip[] = cues.map((cue, index) => {
    const cueId = cue.id ?? index + 1;
    const start = cue.startSec;
    const duration = Math.max(0.05, Math.round((cue.endSec - cue.startSec) * 1000) / 1000);
    return {
      id: `caption-clip-${cueId}`,
      trackId: "track-captions",
      trackType: "caption",
      cueIndex: index,
      start: Math.round(start * 1000) / 1000,
      duration,
      name: cue.text,
      meta: { text: cue.text, cueId },
    };
  });

  // BGM Track
  const bgmClips: TimelineClip[] = [];
  if (script.bgm?.enabled !== false) {
    bgmClips.push({
      id: "bgm-clip-1",
      trackId: "track-bgm",
      trackType: "bgm",
      start: 0,
      duration: totalDurationSec,
      name: `BGM: ${script.bgm?.src || "default"}`,
      meta: {
        volume: script.bgm?.volume,
        duck: script.bgm?.duck,
      },
    });
  }

  const tracks: TimelineTrack[] = [
    { id: "track-scenes", type: "scene", label: "Visual Scenes", clips: sceneClips },
    { id: "track-voice", type: "voice", label: "Voice Track", clips: voiceClips },
    { id: "track-captions", type: "caption", label: "Captions", clips: captionClips },
    { id: "track-events", type: "event", label: "Visual Events", clips: eventClips },
    { id: "track-bgm", type: "bgm", label: "Background Music", clips: bgmClips },
  ];

  const state: TimelineState = {
    totalDuration: Math.round(totalDurationSec * 100) / 100,
    fps: 30,
    playhead: 0,
    tracks,
    selectedClipId: null,
    script,
  };

  // Sync canonical timing back into script.timeline
  state.script = timelineStateToScript(state);

  return state;
}
