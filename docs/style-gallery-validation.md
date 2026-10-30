# Validation — adaptive style gallery

Date: 2026-10-26, Asia/Ho_Chi_Minh.

- `npx tsc --noEmit`: exit 0.
- `npm test`: 35 files / 192 tests pass (final run).
- `node --check public/studio.js`, `node --check src/render/templates/animations.js`, `git diff --check`: exit 0.
- Regression tests cover seventeen catalogue entries (fifteen distinct adaptations), no remote poster resources, same scene data across every pack, legacy maximum scene count, explicit deep-dive extended count, complete later README sections/code, failed-source handling, six coverage categories, source quote/scene-reference checks and visible review warnings, new draft retry on missing coverage/too-short narration, HTTP gallery/poster/preview routes. Legacy fixtures remain covered.
- Live public GitHub README extraction for Vincentwei1021/mg-styles-15: 16,011 characters, twelve section headings. Includes usage, requirements and final limitations; source scope explicitly README, not whole-code audit.
- Live Gemini first successful deep-dive: nine scenes, 338 spoken tokens, one hook choice. Some quote/reference annotations flagged needs-review. A later browser flow after editorial checks produced nine scenes / 282 spoken tokens, short concrete hook and two hook choices; includes Blender exception, 103 samples, installation commands, Node/Python/Chrome/ffmpeg requirements and font caveat. AI annotations that do not match literal source/reference checks remain visibly flagged.
- Browser UI verified: selecting Flat Vector updates the actual preview; gallery shows 17 choices; selecting deep-dive enables the longer duration field; pasting public GitHub URL generates the review and six-topic coverage. Switching review template Flat Vector → HUD leaves all nine voice text fields byte-for-byte identical and the actual preview opens with that draft. No claim of full semantic verification of all AI sentences.
- Actual rendered comparison uses the same short scene/voice/media content in two style packs:
  - output/template-pack-hud-validation/video.mp4
  - output/template-pack-flat-vector-validation/video.mp4
  Both ffprobe: 1080x1920 video, audio stream present, duration 16.366667 seconds. Sampled visual frames inspected at 1.3, 8.3, 12.4 seconds. Both render pipelines complete successfully. These are short visual smoke tests, not validation of final 90/120/180-second TTS duration.
- Geometry and palettes for all fifteen adaptations are implemented and exercised by composer/HTTP tests; only HUD and Flat Vector were fully exported to MP4 in this iteration. Other packs use the same render path and were not each rendered to a separate full video. No new mobile-device visual test or claim of full fidelity to original films.
- Scope limitations and attribution documented in docs/adr-style-gallery.md. Full Remotion/Blender/import-any-repository renderer remains out of scope. No third-party code, brand or video installed/executed by selecting a gallery entry.
