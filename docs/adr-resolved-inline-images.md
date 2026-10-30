# Resolve images inside mockups and galleries

## Root cause

The OpenMontage video `openmontage-open-source-agentic-video-20261026182835-9fb96384` used a phone-mockup titled Backlot Library. Its `screenSrc` pointed to `docs/images/backlot/library.png`, a path inside the source repository rather than inside the exported composition. The automatic placement policy did not support phone-mockup, so it discarded the selected Studio asset ID even though the real README picture had already been downloaded. The media manager only processed `scene.media`, while the mockup renderer directly emitted the unresolved `screenSrc`. The export could therefore complete with an empty black phone frame.

## Fix

- Automatic assignment supports image-bearing mockup/gallery layouts and resolves known repository-relative image references against the selected asset catalogue. The LLM prompt requests Studio asset references in inline image fields.
- A shared scene-media enumerator covers ordinary scene media, mockup screens and each gallery item. Images are copied into the output and recorded in media.json. Existing project-relative `media/` files are reused without copying a file onto itself.
- Both Studio preview and final composition use resolved local media records. Inline pictures are consumed inside their own layouts, without an extra duplicate screenshot overlay.
- Image dimensions distinguish landscape desktop screenshots from portrait phone screens. Landscape screenshots receive a wide frame, and images use contain fitting. Unresolved inline images show an explicit unavailable panel instead of an empty black frame or a broken raw path.
- Export preflight checks every referenced HTML image is a readable local file inside the composition directory. Missing or invalid required files cannot silently pass as a successful render. This does not execute repository code or retrieve arbitrary paths from a repository.

## Existing video

Bind the already cached README library screenshot to scene 3 and copy it into the composition. Recompose using the existing timeline and captions, then replace the video track while copying the original AAC stream unchanged. No LLM or TTS request is made. Original script, manifest, HTML, CSS, cover and video are backed up under `/tmp/lc-openmontage-before-image-fix/`.

## Tests

The inline-image regression covers known repo-relative references, real local image copying, a landscape screen, gallery assets, visible missing-image fallback, export preflight and project-local image reuse. Existing review-template tests now supply resolved media explicitly, matching the production rendering contract.

## Verification

All 220 tests across 46 files passed, along with TypeScript, Studio JavaScript syntax and diff whitespace checks. The repaired MP4 is 60 seconds at 1080×1920 with audio. The original and repaired AAC streams have the same SHA-256 (`d8c7ab979dd208af44bb37427ef98c66e51ae3e683b8a724f607bfc2f4d9f4ac`). Visual inspection of the frame at 21 seconds confirms the Backlot Library screenshot appears in the wide frame without cropping. The Studio server on port 3002 is running the updated code.
