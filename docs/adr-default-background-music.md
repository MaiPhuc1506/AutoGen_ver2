# Default quiet music under narration

## Request and source

The user requested a light music bed on every template, with narration remaining clear, and asked to update the completed OpenDesign video. The referenced TikTok page labels its audio only “original sound - 200Lab”; no separate track identity was established. We use an original procedural instrumental rather than claiming to reproduce or extracting that soundtrack.

## Implementation

`DEFAULT_BGM` is shared by new script generation and pipeline fallback. It is independent of the selected visual template. Studio sends an explicit enabled/disabled selection, checked initially. Existing custom music remains supported; `bgm.enabled:false` prevents mixing (for example, with a user recording that already contains music). The old `soundDesign` switch continues to control scene sound effects separately.

The bundled soft-tech track is 24 seconds at 80 BPM, synthesized from oscillators and deterministic noise by `scripts/create-soft-tech-bgm.mjs`. No additional dependency, external music sample or API is needed. It is looped, faded in/out and extended through the final visual hold.

The previous mixer ignored `duckVolume`. The new mixer first matches the music source's measured mean level to the narration, then applies a quiet gain (0.16). A parallel floor (0.06) plus sidechain-compressed remainder lowers music during speech and allows it to rise in gaps. Limiting at 0.95 with automatic gain disabled protects peaks without raising the narrator's level. The floor setting now actually affects the mix. A synthetic audio regression measures the background frequency in speech/gap intervals and compares two requested floors.

The OpenDesign update starts from `voice-before-bgm.mp3`, preserving pronunciation, speed and timing. Only its AAC soundtrack is replaced; H.264 video packets are copied. The previous audio/video are retained in `/tmp/lc-opendesign-before-soft-music.*`. This avoids stacking two music beds or recomputing visual frames.

## User controls

Reload port 3002. Leave “Nhạc nền nhẹ · tự giảm khi có giọng nói” enabled for ordinary videos. “Nghe bản nhạc nền” previews the unmixed track; the actual exported mix is quieter. Turn it off when the uploaded recording already includes music.

## Validation completed

- Reproduced the ignored duck-floor setting with a failing audio test, then verified actual background-frequency attenuation during speech and the distinct effects of two floor settings.
- `npx tsc --noEmit`: passed. `npm test`: 43 files, 215 tests passed in 30.96 seconds. JavaScript syntax and `git diff --check` passed.
- Full pipeline rendered `output/devpeek36-defaults-validation/video.mp4` from a script that originally omitted BGM. Saved script now contains the shared enabled default; ffprobe: 1080×1920, audio present, 5.200000 seconds.
- Updated `output/open-design-nexu-io-20261026163310-ec43fd94/video.mp4`: 1080×1920, audio present, 60.000000 seconds. Encoded video SHA256 is identical before and after replacement: `12c5cb7b092cc7b76ebd23a20efaac5e8ff5e929bb757e93849e2dad570159cb`. Mixed MP3 mean/peak: -22.1 / -4.8 dBFS. A short preview is saved beside it as `preview-with-music.mp4`.
- Live browser showed the checkbox checked initially and the music preview expanded. Screenshot: `output/zerotts-validation/bgm-default-ui.png`. The music endpoint returned HTTP 200, audio/mpeg.
- Removed the old duplicate URL-form BGM toggle so one shared Studio control determines the setting for both URL and text workflows.

Human judgement of musical taste and voice/music balance remains for the user to confirm by listening to the updated video.
