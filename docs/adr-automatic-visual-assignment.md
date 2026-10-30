# Avoid repeated repository screenshots

## Cause

The completed PersonaLive project `personalive-gvclab-20261026174902-9cbd7d69` used the same GitHub-page screenshot in scenes 1, 3, 5 and 7. The server attached an LLM-selected asset to any supported card layout, without checking image kind, storyboard basis or prior use. It could therefore cover feature lists and a research disclaimer with an unrelated repeated page image. Asset metadata sent to the LLM also omitted the image kind.

## Change

New generated drafts use one shared placement policy. Generic repository screenshots are restricted to the opening. A README image can appear once when the scene is explicitly based on a source asset. Source-example and conceptual body scenes retain their text/code/diagram layouts. Account avatars are not automatically used as body illustrations or treated as project logos. Source URLs deduplicate identical images across different upload IDs; distinct user uploads with a shared generic label remain distinct.

The opening screenshot fallback moved from the frontend into the same policy, so it cannot independently reinsert repeated media. The LLM receives the asset kind and matching instructions. The policy runs while constructing a fresh draft, not while rendering an explicitly edited script; the review editor still permits intentional manual media choices.

## Existing video repair

Keep the introduction screenshot and the distinct README diagram in scenes 1–2. Remove the duplicate media overlays in scenes 3, 5 and 7 so their native animated layouts display the existing content. Preserve every voiceText, scene timing and caption. Recompose the visual HTML using the saved scene durations and original `voice.mp3`; do not call Gemini or TTS. Copy the original AAC stream into the final MP4 after rendering the revised visuals. Refresh the cover automatically.

The original script, media manifest, HTML, cover and MP4 are backed up under `/tmp/lc-personalive-before-visual-fix/`. `visual-fix.json` records the before/after scene assignments.

## Verification

- HTML media references decreased from five placements to two distinct assets. VoiceText and the stored timeline compare equal to the original script.
- Inspected exported frames at 18 and 49 seconds: native feature cards and the disclaimer are visible, with no repeated repo screenshot. Frames are saved beside the MP4 as `visual-fixed-18s.png` and `visual-fixed-49s.png`.
- ffprobe: 1080×1920, audio present, exactly 60.000000 seconds. Original and final AAC stream SHA256 both equal `5cd80f81c013f0a66ae0d5ef64e0478ef8e66e5ea7fc5b96ae263e8b8c892fbc`.
- TypeScript, JavaScript syntax and diff whitespace checks passed. Full suite after rendering: 45 files, 219 tests passed (`npm test -- --maxWorkers=1`). An earlier concurrent run hit two existing 5-second FFmpeg test timeouts while video capture was active; rerunning after capture completed passed without increasing timeouts.
- Server on port 3002 restarted with the new assignment policy. The existing video's cover was refreshed after the visual render.
