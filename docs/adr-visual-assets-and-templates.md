# Visual assets and editable scene templates

Date: 2026-10-26 (Asia/Ho_Chi_Minh)

## Decision
Keep the existing HyperFrames/HTML/GSAP render pipeline. A Remotion React composition cannot be loaded directly into that runtime. The reference repository uses separate React scenes with frame-dependent spring animations and a Series timeline, not a JSON-driven universal template importer. We studied the scene structure and motion approach and wrote new HTML/CSS/GSAP implementations; no source/assets/branding were copied from that repository.

References:
- https://github.com/Cuongyd196/remotion-cuongit-template
- https://github.com/Cuongyd196/remotion-cuongit-template/blob/main/src/DockerExplainer/DockerExplainer.tsx
- https://www.facebook.com/reel/27974855735519825

## Changes
- New drafts preserve original English technical terms. Studio defaults to `voice.pronunciation: "original"`, bypassing the speech dictionary in preview, full TTS and Re-TTS. Existing scripts without this optional field keep legacy lexicon behaviour. Spoken English quality remains provider-dependent. This does not reverse phonetic spelling already saved in old drafts.
- `POST /api/studio/github-visuals` accepts only canonical public HTTPS GitHub repository URLs. Capture the repo page with the existing Puppeteer screenshot service (now discovers macOS Chrome), extract up to four non-SVG README images on allowlisted GitHub asset domains, and optionally retrieve the account avatar. An account avatar is labelled as such, not assumed to be a project logo.
- Manual upload accepts raster PNG/JPG/WebP/GIF up to 10 MB and normalizes the first frame to PNG using FFmpeg. Assets use UUIDs under ignored `.uploads`, with metadata and provenance; media manifests retain original sources. No remote code is installed or executed. GIF/animated WebP uploads are still images in this version.
- Scene `media.presentation` optionally selects `background`, `card`, `logo`. Omission preserves legacy media rendering. A selected global `metadata.logoAssetId` is copied into output/media. The rendered project is self-contained even if the upload is later removed. Preview/timeline routes serve nested media.
- New `workflow` and `code-window` templates use bounded data and escaped text; displayed code is never executed. Fourteen existing/new scene types have catalogue entries. AI receives the actual schema including these types.
- Review supports scene layout selection, every templateData field through JSON, per-scene image and transition selection, and a full layout-only preview (fixed three seconds per scene, without synthesized voice). This preview is not a timing or final audio preview.
- Optional `colorTheme: "midnight"` changes the editorial palette. Default remains unchanged.

## Limits
No direct import of arbitrary Remotion repositories, arbitrary uploaded HTML/JavaScript, automatic recognition of a true project logo, automatic stock/video montage, private GitHub access, or guarantee that every GitHub README exposes usable images. Source imagery is not evidence that code was tested. Capture/download failures are shown and manual upload remains available. The library in the browser is session-local; selected render assets are copied into their output project. README image discovery currently checks main/master README.md and raster assets on the GitHub allowlist, not arbitrary documentation sites or SVGs.
