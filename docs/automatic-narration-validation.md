# Automatic narration duration validation — 2026-10-29

Implemented: AI Studio drafts with selected target seconds use real selected-voice TTS measurement before review. Bounded automatic repair preserves the visual structure and outro. Short body scenes append source-backed detail instead of replacing good narration with a shorter draft. Hook is checked by measured seconds (2–6); total narration must fit with at most 15% tempo correction. Final pipeline refits measured audio including gaps and outro hold. Uploaded audio and legacy scripts keep their existing flow. Nam Minh base speed 1.2x and all ZeroTTS options remain available.

Verified:
- `npx tsc --noEmit`: exit 0.
- `npm test`: 52 files / 253 tests passed.
- JS syntax and `git diff --check`: passed.
- Real reference render: `output/automatic-narration-render-validation/video.mp4`, 1080×1920, video + audio, 13.875 seconds. This is a render regression sample, not a claim of a generated 90/120-second film.
- HTTP gallery and updated Studio assets: 200, 16 layouts.
- Tests cover automatic 90/120-second repair, measured plans for 90/120/180 seconds, overlong hook rejection, original README retention across retries, preserving ZeroTTS, narration-only design/outro preservation, and separate bounded retries for temporary provider outages.

Live AI validation is NOT accepted yet. User authorized public PersonaLive README to configured Gemini and Edge Nam Minh. Earlier live candidates exposed over-short narration and a legacy hook word cap; these drove the changes above. The final live attempts could not complete because Gemini repeatedly returned 503/timeouts or invalid script structure. A model from the service model listing returned 404 when used; three other model probes returned 503/timeouts even on a minimal non-sensitive JSON request. The user's persisted model configuration was not changed. No accepted 90/120-second live narration is claimed.

Logs: `output/automatic-narration-validation/`. The local web runs in a detached process with logs at `.cache/web-3000.log`.
