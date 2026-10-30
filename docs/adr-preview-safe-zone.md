# Preview guides must not appear in video exports

## Report and cause

The reported OpenDesign video (`open-design-nexu-io-20261026163310-ec43fd94`) had `metadata.safeZoneOverlay: true`. The HTML composer previously inserted the red TOP SAFE / ACTIONS SAFE / caption safety overlay whenever that saved flag was true, including production compositions. The LLM also received the optional field in the schema and could enable it. This was an editor guide being burned into the exported MP4, rather than a template colour effect.

## Fix

`ComposeArgs.purpose` defaults to export. A guide requires both `purpose: 'preview'` and the saved metadata flag. Only the two Studio preview endpoints opt into preview purpose. Normal pipeline, caption import and rerender consumers produce clean compositions even with old metadata. The pipeline no longer applies a global preview flag to an export script. The LLM generation boundary resets the guide flag to false for new drafts. Existing scripts and their content remain valid.

The user also refined the requested reading: standalone `open` → `ô bình`, `OpenDesign` → `ô bình đi zai`. Original display spelling is retained; the speech cache changes for affected scenes. Existing explicit per-video pronunciation overrides continue to take precedence.

## Verification

- Reproduced the red-overlay bug with a failing test before the fix.
- Regression checks legacy saved `true` across native/default rendering and all 17 template packs. Preview-mode guides remain covered by the existing motion test.
- Added checks that an LLM-returned `true` is cleared and that Open/OpenDesign replacements preserve the separate OpenAI entry.
- TypeScript passed. Full suite: 42 files, 214 tests passed; see the follow-up render validation for the actual MP4 result.

The affected video is reprocessed through the full pipeline so corrected speech, fitted duration, captions and MP4 remain aligned. The previous MP4 was saved to `/tmp/lc-opendesign-before-guide-fix.mp4` for comparison.

Actual rerender completed successfully: H.264 1080×1920, AAC audio, ffprobe duration `60.000000`. Inspected the exported frame at 24 seconds (`output/zerotts-validation/safe-zone-fixed-24s.png`): the previously red top, right and bottom guides are gone; logo, template content and GitHub screenshot remain visible. Exact speech report starts `ô bình đi zai là…`. Live `/api/studio/pronunciation` also returned `ô bình` for standalone open. After adding the two extra assertions, the four affected test files passed again (18 tests).
