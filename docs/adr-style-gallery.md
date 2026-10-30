# Adaptive style gallery and source coverage

Date: 2026-10-26 (Asia/Ho_Chi_Minh).

## Source and decision
Reference: https://github.com/Vincentwei1021/mg-styles-15 (MIT, Vincentwei1021, 2026). README, style prompt files and representative flat-vector/HUD source were inspected. The original films are fixed ten-second narratives, predominantly 1920x1080, using renderAt(t), SVG/Canvas/WebGL/Three.js, with a Blender exception for 3D. They do not expose a common script.json contract for arbitrary repository knowledge.

Implement fifteen knowledge-video adaptations of that visual vocabulary in the existing HTML/GSAP renderer, plus the two native styles. The gallery explicitly labels these as adaptations, offers source links, and previews the actual local adapted renderer. We do not display an original film as if it were the output of our renderer. Geometry, layouts, CSS and timeline code here are newly written. No original film, brand, soundtrack, instrument sample, external font, WebGL shader or Blender sequence is copied into output. Keep the reference MIT notice under assets/third-party/mg-styles-15.LICENSE for attribution. Soft 3D is explicitly labelled CSS, not a Blender integration.

## Architecture
- src/render/style-packs.ts defines id, palette, geometry, motif and source mapping. Shared geometry supplies small SVG posters and per-scene motif decorations in the actual renderer.
- Optional templatePack travels in script.json, server generation, browser review, preview and full pipeline. Changing it changes presentation and leaves scene voiceText/templateData/media unchanged.
- Deterministic GSAP motif animation uses the existing seekable timeline; no random, requestAnimationFrame, setInterval or newly installed rendering dependency. Only the selected live preview iframe runs; the other gallery cards are lightweight SVG posters.
- Pack id is schema-validated. No arbitrary code/remote repo execution or on-demand installation occurs when selecting a template.

## Content correction
The old GitHub extraction kept four short opening sentences and discarded code, requirements and later limitations. New extraction reads the public repository README via GitHub API/default branch with main/master fallback; preserves markdown sections and fenced examples. It fails explicitly rather than inventing an AI-product description. Very large READMEs retain a bounded beginning and ending and disclose truncation. This is README analysis, not whole-source-code auditing.

New Studio drafts request optional contentMode overview/deep-dive and a target duration. Overview/legacy remain at most eight scenes; explicit deep-dive supports up to sixteen scenes, 90/120/180-second targets. Legacy fixtures and absent optional settings retain previous behaviour. New drafts have one main hook; zero to three alternative hooks are optional. The number of hook choices is independent of scene count.

AI creates a six-category coverage table: purpose, features, usage, requirements, limitations, examples, with source excerpts and scene references, plus omitted topics. Server checks reference/evidence integrity. Mismatched annotations become needs-review with visible warnings; they never silently become verified coverage. Matching a quote does not verify every semantic claim or prove that every feature was narrated. Users must review source claims. AI cannot decide its own provider/preset/source; those fields are normalized from the request. Preview and switching packs do not rewrite the script.

A minimum narration budget is checked for new Studio generations to reduce extremely short drafts under longer targets; final duration remains dependent on TTS speed and pauses. No padded silence or forced speech stretching is used to claim an exact duration.
