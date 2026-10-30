# Validation · 2026-10-26

- `npx tsc --noEmit`: exit 0 after final TypeScript changes.
- `npm test`: 37 files, 200 tests passed (4 seconds); external APIs mocked in suite. Includes legacy schema limits, explicit 2–24 auto scenes, typed/escaped illustrations, bounded same-repo source collection, auto generator with four scenes, measured duration fit, Unicode dictionary boundaries and canonical subtitles when TTS returns phonetic words.
- `node --check public/studio.js`, `node --check src/render/templates/animations.js`, `git diff --check`: exit 0.
- Real render: `npm run pipeline -- output/director-devpeek36-validation/script.json`; four scenes, real Edge TTS, dictionary pronunciation, flat-vector pack, data-flow and worked-example, target 30 sec. Audio fitting tempo 1.020907840440165; derived timeline 30.000021 sec. Original TTS cache preserved.
- ffprobe final MP4: video 1080×1920, audio stream present, duration **30.000000** sec. Final flow/example frames visually inspected; pale labels on light palette corrected then MP4 re-rendered and rechecked.
- CUA UI at localhost:3002: defaults DevPeek36, dictionary selected, auto directing and fit enabled. GitHub scan reported actual files README.md and package.json for mg-styles-15. Real configured Gemini created six-scene/82-word/30-sec draft with storyboard on all scenes, code-window and zoom transition; a retry shortened the initial over-budget narration. This draft was preview/review tested, not the real MP4 fixture above.
- Evidence annotations that did not match exactly were visibly marked for review. This is not a claim all facts or pronunciations were independently verified. Source-scene semantic correctness still requires editorial review.
- Artifacts: `output/director-devpeek36-validation/video.mp4`, `flow.png`, `example.png`, `studio.png`, `duration-fit.json`. Fixture: `tests/fixtures/studio-director.json` (illustrative internal example, not a claimed live demo).
- Only the 30-second case was real-render validated in this milestone; no claim all 17 packs or all 30–180 sec targets were separately rendered. No arbitrary GitHub code execution or real-demo recorder added.
