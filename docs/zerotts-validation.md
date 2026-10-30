# ZeroTTS validation

## Checks completed

- `npx tsc --noEmit`: exit 0.
- `npm test`: 41 files, 213 tests passed. An initial run hit a 5-second timeout in the existing FFmpeg upload test while many workers shared resources with the local model. Vitest now uses at most two workers; the complete run passed in 42.01 seconds without raising test timeouts.
- `node --check public/studio.js`: exit 0.
- Python worker syntax compilation with the installed Python 3.12: exit 0.
- `git diff --check`: exit 0.
- New provider tests mock the synthesis boundary and cover bundled voice validation, authenticated request, audio conversion, invalid WAV, HTTP failure and voice/model cache identity.

## Real synthesis and web interaction

Installed `zerotts==0.1.5` in the isolated environment and loaded the pinned model successfully on this Mac. All eight bundled voices were present. The first load required copying model files out of Hub symlinks so ONNX external data could resolve correctly.

Generated `output/zerotts-validation/quangminh-sample.mp3` using the actual local engine. ffprobe duration: 6.121063 seconds. The exact original and spoken text are recorded in `sample-text.json` beside the audio. Spoken substitutions include `âu bình đi zai`, `ây chình`, and `đép bít ba sáu`.

Opened the local web in a separate test browser tab, confirmed ZeroTTS/Quang Minh selected, entered a short OpenDesign/Agent preview and clicked Nghe thử. The player appeared and the interface reported playback. Screenshot: `output/zerotts-validation/studio.png`. These checks verify generation and playback, not a human judgement that all pronunciation is perfect.

## Real full video

Ran `npm run pipeline -- output/opendesign-zerotts-20261026/script.json` with eight scenes and actual Quang Minh synthesis. Final `output/opendesign-zerotts-20261026/video.mp4`:

```json
{"video":{"codec":"h264","width":1080,"height":1920},"audio":{"codec":"aac"},"duration":"60.000000"}
```

Inspected the extracted frame at 8 seconds (`output/zerotts-validation/video-frame.png`): DevPeek36 logo is visible and the asset label is compact `GitHub · nexu-io/open-design`, with no raw image URL banner. The renderer reported non-blocking lint suggestions and two 404 resource messages; the final MP4 passed format checks and the inspected frame contained the intended screenshot asset. Full visual and subjective pronunciation review remains with the user.

The rendered project has explicit corrected pronunciation overrides and a new title: `OpenDesign · ZeroTTS · phát âm đã chỉnh`. Earlier MP4 files remain unchanged.
