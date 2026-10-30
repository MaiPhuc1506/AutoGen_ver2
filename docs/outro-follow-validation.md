# Outro Follow — 2026-10-26

New Studio drafts use a shared outro default: “Chào tạm biệt! Follow kênh DevPeek36 để cập nhật thêm nhiều repo và tin tức công nghệ mới nhé.” Channel name remains configurable; the pronunciation dictionary still maps DevPeek36 to “đép bít ba sáu” for TTS only. AI word budgets include the default outro before validation; manual/imported narration is not rewritten during render.

Fixed the previous editorial suppression of the follow card. All 17 packs, calm/dynamic modes and Classic share a native monogram/profile card, Follow → Đã theo dõi state, pointer movement, button press and click ring. Animation uses fractions of scene duration and the existing seekable GSAP timeline. Theme palette controls contrast; card stays above captions in the safe region. The displayed name/handle come from the outro channel, rather than unrelated provider/global branding. This is a rendered animation, not an interactive subscription action.

Validation:
- TypeScript and animation JavaScript syntax: exit 0.
- Vitest: 38 files / 203 tests passed. Added pack-wide markup and shared-animation regression checks, configured channel isolation and default narration/phonetic checks.
- Real sample: `output/outro-devpeek36-validation/video.mp4`, 4 scenes, 30-second target, Flat Vector, real Edge TTS. See frame images and ffprobe evidence alongside this document's final report.
- Old saved projects retain their narration; create a new draft or edit outro voice text to adopt the new default. No original videos were overwritten.

Font import regression fixed in `src/render/css.ts`: strip complete quoted URL rules, preserving embedded semicolons. Shared `styles.follow-card.css` is appended for both theme files and previews. Initial bad-position render was replaced after this correction.

Final real-render verification: ffprobe reports 1080×1920 video, audio stream, 30.000000-second duration. Inspected frames at 26.1s (cursor on Follow) and 27.5s (Đã theo dõi); card remains below title/source and above captions. Preview excerpt: `output/outro-devpeek36-validation/outro-preview.mp4` (~7 sec). HTTP HUD preview confirms card/cursor and valid shared CSS. Only Flat Vector received a complete MP4 render in this change; all packs/modes received structural regression coverage.

## Channel logo update

The existing `assets/avatar.jpg` was visually inspected and contains the actual DevPeek36 robot/wordmark. It is now used in the persistent header and Follow card for DevPeek36, via the local avatar copied into each render output. Chosen `metadata.logoAssetId` overrides the logo in both places. Other channel names without an explicitly selected logo retain a neutral monogram in the Follow card. Raster logo uses contain fit without cropping; no raster artwork was edited.

Preview uses the local Studio avatar endpoint. Gallery preview is branded DevPeek36 and draft preview resolves either its selected asset or the default channel logo. UI default label now accurately says Logo kênh DevPeek36 rather than Không dùng logo.

Validation: `npx tsc --noEmit` exit 0; 38 test files / 204 tests passed; `node --check public/studio.js` and `git diff --check` exit 0. Added regression checks for default logo, chosen override, header/card consistency and neutral treatment of other channels.

Logo real-render acceptance: `output/outro-devpeek36-logo-validation/video.mp4` reports 1080×1920 + audio, 30.000000 sec via ffprobe. Frame at 27.5s visually confirms the DevPeek36 image in header and Follow card, correct cursor/button placement and unobstructed captions. Seven-second excerpt: `outro-preview.mp4` in that output folder. HTTP Flat Vector preview confirms both logo image sources resolve to `/api/studio/assets/avatar.jpg`.
