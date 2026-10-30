# Pronunciation and on-screen attribution repair · 2026-10-26

## Observed failure

The OpenDesign project used dictionary mode, but the dictionary did not cover OpenDesign, Agent, MCP, HyperFrames, pnpm, SSRF and related terms. The generated narration also incorrectly converted the wildcard in pnpm 10.33.x to “chấm ít”. Raw README image credit URLs were rendered twice: in the browser card and an unbounded badge at the channel header.

## Changes

- Added OpenDesign → “âu pần đi dai”, Agent → user-requested “ây chình”, plus terms present in this video. Original narration/display spelling remains intact; phonetics are applied only at the TTS boundary.
- Optional `voice.pronunciationOverrides` allows up to 80 per-video mappings; the review screen displays the exact post-dictionary TTS input, highlights recognizable unknown technical names, and supports editing mappings before listening/rendering. Preview, full pipeline and single-scene re-TTS share the same transformation. Fingerprints include actual transformed text, so pronunciation changes invalidate voice cache.
- Unmapped uppercase acronyms receive letter readings; dotted versions/wildcards receive controlled number/letter readings. All replacements use original-text spans, without cascading dictionary substitutions. Original mode remains an explicit opt-out. Unknown English names still need preview/editorial choice; this is not a universal English pronunciation guarantee.
- New AI drafts reject raw spoken URLs and the observed malformed “chấm ít/phẩy ít” version construction, with retry feedback asking for canonical version strings. The affected saved draft was corrected to Node 24 and pnpm 10.33.x using its saved source.
- `sourceLabel` turns GitHub raw asset URLs into a compact owner/repo label, other URLs into hostnames, local paths into a neutral label, and bounds text length. Cards show one source label in their browser bar; they no longer receive a duplicate top badge. Background credits remain bounded and below the channel header. Full source and credits stay in script.json/media.json.
- `pronunciation-review.json` accompanies renders with the original narration, exact TTS text and review hints. No credentials are included.

## Validation

`npx tsc --noEmit`, `node --check public/studio.js`, `git diff --check`: exit 0. Vitest: 40 files / 210 tests passed. Regression cases include raw URL/query/credential/path removal from on-screen attribution, preservation of provenance, canonical captions, Agent overrides and cache invalidation, version wildcard handling, unknown-name hints and API pronunciation preview.

Real repair: `output/opendesign-pronunciation-fixed-20261026/video.mp4`; ffprobe 1080×1920, audio present, **60.000000 sec**. Scene 2 frame at 8s visually checked: no raw URL banner near the channel header, compact GitHub · nexu-io/open-design in the asset card. Exact TTS text checked in pronunciation-review.json, including Agent and version readings. Auditory preference remains for the user to assess in the preview; no claim every English word was independently listened to or verified.

Original project/video is preserved. The repaired version appears separately as “OpenDesign · sửa phát âm và nhãn nguồn”.
