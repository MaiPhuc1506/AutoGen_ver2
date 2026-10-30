# Automatic per-video thumbnails

The user allowed either a video's opening frame or a repository introduction image. Choose the opening frame: it already contains the chosen template, channel logo, headline and any resolved repository screenshot, without a new network request or an unrelated image crop.

Completed videos keep a full-resolution `cover.png`. The pipeline and rerender command generate it automatically. The thumbnail endpoint repairs missing or outdated covers, caches concurrent requests and publishes the PNG atomically. Normally it selects one second into the opening; short videos use an earlier point and fall back to the first frame when there is no later frame to seek to.

The library now uses lazy static images instead of opening an MP4 for every card. Portrait cards preserve the full 9:16 cover. The active player uses the same poster and exposes “Tải Thumbnail PNG” immediately. It tracks the active video's slug so the cover and publish checklist cannot come from a different timeline project. A downloadable cover can be selected during posting; this feature does not post videos to social platforms.

No script schema or external dependency was added. Existing videos with current covers reuse them. Existing projects that have not rendered a video continue to show their previous placeholder.

## Validation

- TypeScript and JavaScript syntax checks passed; `git diff --check` passed.
- Full suite: 44 files, 216 tests passed. The new integration test checks a one-frame video, concurrent requests, a cached cover, stale-cover refresh, PNG dimensions, download response, library URL and invalid/missing video requests.
- Full pipeline sample `output/devpeek36-defaults-validation/video.mp4`: ffprobe 1080×1920, audio present, 5.200000 seconds. Its cover was regenerated automatically. OpenDesign's cover is 1080×1920.
- Backfill verification found 15 rendered videos and 15 ready covers, zero failures.
- Browser verification confirmed visible thumbnail images and the OpenDesign-specific download link. Screenshots: `output/zerotts-validation/thumbnail-library-ui.png` and `thumbnail-download-ui.png`.

Usage: reload localhost:3002, open Thư Viện Video, then open a video and choose Tải Thumbnail PNG. Video generation needs no extra thumbnail action.
