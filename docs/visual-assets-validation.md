# Validation — visual assets and editable templates

Date: 2026-10-26, Asia/Ho_Chi_Minh.

- `npx tsc --noEmit`: exit 0.
- `npm test`: 33 files / 185 tests (see final run); real external services mocked in unit tests.
- `node --check public/studio.js`: exit 0; `git diff --check`: exit 0.
- Actual public GitHub collection for Vincentwei1021/mg-styles-15 returned six assets: one screenshot, four raster README images, one accurately labelled owner avatar. No collection warnings. Screenshot inspected locally.
- Browser UI: selected midnight palette and review_60, collected imagery through the button, generated a Gemini draft, confirmed original English `AI` in hook, switched body scene to workflow and opened the layout-only preview. Corrected preview centering and stage clipping. Proof image stored at output/github-screenshot-va-workflow-20261025170022-580cf37c/studio-ui.png. Browser-based editor flow was verified on desktop; no claim of a new dedicated mobile-device test in this iteration.
- Final live Gemini call: generation.mode=ai, seven scenes, three hook suggestions, pronunciation=original. AI hook alternatives are no longer supplemented with raw multilingual README sentences when AI is active.
- Actual render with Python Edge TTS, logo LC created for the test, GitHub screenshot, README cover, workflow and code-window: output/github-screenshot-va-workflow-20261025170022-580cf37c/video.mp4. Re-rendered the same pipeline after final CSS updates using cached speech. ffprobe: video 1080x1920, audio present, duration 16.366667 s (purpose-built short feature demo, not a 60-second duration validation). Inspected sampled frames at 1.3, 5, 8.5 and 12.4 seconds.
- The reference Facebook reel was viewable after dismissing the login popup; the GitHub React source was read via the GitHub connector. New implementation is native code and does not copy that repository's code, brand or media.
- Not tested: paid TTS providers live, arbitrary Remotion import (not implemented), private repos, SVG logo import (not supported), or automatic selection of a true project logo.
