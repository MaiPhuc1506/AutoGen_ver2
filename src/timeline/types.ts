import type { Script, TimelineSpecType } from "../render/script-schema.js";

export type TimelineTrackType = "scene" | "voice" | "bgm" | "caption" | "event";

export interface TimelineClip {
  id: string;
  trackId: string;
  trackType: TimelineTrackType;
  sceneId?: string;
  cueIndex?: number;
  eventId?: string;
  start: number; // in seconds
  duration: number; // in seconds
  offset?: number; // trim start offset in source asset, in seconds
  name: string;
  meta?: Record<string, unknown>;
}

export interface TimelineTrack {
  id: string;
  type: TimelineTrackType;
  label: string;
  clips: TimelineClip[];
  muted?: boolean;
  locked?: boolean;
}

export interface TimelineState {
  totalDuration: number;
  fps: number;
  playhead: number;
  tracks: TimelineTrack[];
  selectedClipId?: string | null;
  script: Script;
}

export interface TimelineSnapOptions {
  threshold?: number; // default 0.1s
  snapToPlayhead?: boolean;
  snapToClips?: boolean;
}
