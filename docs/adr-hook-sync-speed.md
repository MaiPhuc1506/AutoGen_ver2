# Hook, caption timing and render preparation

## Changes

- Remove duplicate sentences from AI revisions and adjacent scene openings. Appending source-backed narration filters old sentences even if the AI returns them after a new sentence. No filler is added to compensate.
- New GitHub hook narration uses only an API snapshot matching the source repository. The source repository name and count are spoken before the benefit; rounded counts are explicitly approximate. The verified prefix is idempotent and protected during AI revisions. The canonical source URL supplies the name even if the star API is unavailable; the AI hero label cannot substitute a different repo name. Missing GitHub data produces no invented spoken count. The prefix survives 90/120-second narration repairs and all Studio hook choices. Existing count-only prefixes upgrade without repeating the opening. Uploads remain untouched.
- Edge Python synthesis requests WordBoundary events and returns actual word timestamps through stdin/JSON. Original spelling (GitHub, acronyms, numbers) maps onto the spoken boundaries; ambiguous multi-token mapping stays low accuracy. Tempo fitting scales these timestamps instead of recreating uniform estimated timings. Captions break at sentence endings and long pauses.
- A content-addressed speech cache survives draft→render directory changes and coalesces concurrent synthesis in one server process. Edge synthesis can run two scenes concurrently. Very short scripts are repaired before synthesizing full audio.
- New Studio exports default to 1080p/24fps/standard quality/two workers. A visible 30fps option remains. Existing scripts without renderSettings retain their existing renderer defaults. No dependency or ZeroTTS voice/model changes.

## Measurements and limits

The real cleanyourtv hook sample fetched 44,968 GitHub stars on 2026-10-29 and spoke “Khoảng 45 nghìn sao trên GitHub” followed by the benefit. Both scene timing files report high accuracy. The 9.833333-second sample has 1080×1920 H.264 video at 24fps plus audio. GitHub's displayed word span is 1.485–1.860s; the next spoken sentence starts at 2.550s, and its caption no longer appears during the intervening pause.

On the same short composition, standard-quality 24fps capture took 96.87s with two workers and 115.57s with four. Four workers were therefore not promoted. A subsequent draft-quality pipeline took 131.78s including setup; no draft-speed advantage is claimed, so standard quality is retained for the default fast profile. A cached-audio preparation pass advanced from the TTS stage to concatenation in about one second, without another provider synthesis.

24fps requires 20% fewer frames than 30fps. This is a frame-count reduction, not a guaranteed 20% wall-clock speedup. A full corrected 90/120-second render has not been benchmarked in this change. The prior 90-second file remains intact; it does not acquire corrected audio/captions without a new pipeline run.

Validation output: `output/hook-sync-speed-validation/`. Live sample generation used Edge TTS and the public GitHub API, without a Gemini call. Tests use fake providers/fixtures; the shared-cache test supplies an isolated directory.

## Spoken repository identity follow-up

The hook now says the canonical repository name from the input GitHub URL before its verified star count and benefit. Example: “cleanyourtv có khoảng 45 nghìn sao trên GitHub. Gỡ quảng cáo không cần root.” Without a verified star count it still introduces the name. AI-generated source URLs and star snapshots cannot replace the supplied repository identity or supply counts. Existing count-only hooks migrate when rendered; uploads retain their supplied narration.

The identity and verified count share the existing optional protected-prefix field, preserving old scripts. Narration-only repair deducts all prefix words from the hook budget and restores the introduction before returning. Every Studio hook suggestion uses the same normalization, so changing suggestions retains the identity. Regression tests cover missing counts, incorrect source snapshots, repeated prefixes, older introductions, uploads, and 90/120-second repairs.

Live validation: `output/hook-identity-validation/`. Edge Nam Minh at 1.2× measured the hook at 5.160 seconds, within the six-second budget. The live GitHub snapshot contained 45,005 stars; the spoken approximate count is 45 thousand. Word boundaries include the name at 0.100–0.662 seconds and report high accuracy. This is a short hook/outro validation, not a full 90/120-second re-export.

Final checks: `npx tsc --noEmit` exited 0. `npm test -- --maxWorkers=1 --testTimeout=20000` passed all 267 tests in 55 files. The initial parallel run had one existing FFmpeg upload test exceed its five-second timeout; the sequential full run passed. The real sample render completed and ffprobe confirmed 1080×1920 at 24fps, an audio stream, and duration 9.322667 seconds. Logs are saved under `output/hook-identity-validation/checks/`. Localhost returned HTTP 200 after the web server restart.
