# Repo storyboard, flexible scenes and measured duration

User approved combining storyboard planning and native illustrations. Extend the existing TypeScript/HyperFrames pipeline; no new dependency or arbitrary generated JavaScript execution.

## Source and planning

`github-context.ts` reads the public README, default-branch tree and at most four bounded docs/example/package files from the same repository. Optional files are at most 16 KB each, 32 KB combined. Hidden paths, traversal, large files, binary files and arbitrary remote URLs are excluded. Rate-limit/tree errors retain an explicit README-only scope. Files are untrusted source data; never instructions and never executed. This is selective document inspection, not a complete code audit.

The existing configured LLM produces narration and typed per-scene storyboard: purpose, visual brief, evidence, conceptual/source-example/source-asset basis and transition rationale. Optional asset IDs must reference supplied local Studio assets; only suitable layouts receive image cards. Evidence is matched against source text; unmatched quotes/code are marked for review. Matching a quote is not semantic verification of the whole scene. Never label illustrations as captured demos or executed output.

`directingMode: "auto"` permits 2–24 scenes. One opening and one ending remain required. Six coverage categories are a separate editorial checklist, never six mandatory scenes. Legacy scripts retain 5–8 scenes, deep-dive 5–16, with their old prompts. New mode prioritizes duration and source facts, with a bounded narration budget and retries.

## Illustration and preview

Two new native typed layouts: `data-flow` (2–4 nodes and links) and `worked-example` (input, operation, output with visible conceptual/source-example label). `code-window.highlightLines` highlights selected lines. Every layout supports the existing style packs and seekable GSAP timeline; code and text are escaped. No arbitrary HTML/code template import. Actual draft preview uses the same composer as render. Real automatic demo recording is not part of this milestone.

## Duration and speech

Optional `fitDuration` applies only to generated TTS, with `targetDurationSec` 30–180. Measure actual scene audio; reserve all scene gaps and outro hold; derive per-scene WAV files via pitch-preserving FFmpeg `atempo`. Ratios outside 0.65–1.6 fail with an actionable rewrite/duration message instead of clipping speech or inserting long silence. Original TTS cache remains unchanged. Derived timestamps use original narration, explicitly low confidence. Total visual duration follows the target; at 30 fps allow frame rounding. Uploaded narration is not stretched.

Studio defaults to dictionary pronunciation. Dictionary changes apply immediately after save and invalidate cache through the resulting spoken text. Unicode boundaries prevent accidental replacement inside Vietnamese words. Original narration and on-screen text retain English spelling; phonetic text is sent only to TTS. When substitution changes words, provider timings are not reused as if they matched the original spelling: original captions are estimated and marked low confidence. Dictionary does not guarantee every voice pronounces every word perfectly; preview and edit mappings.

Channel default is DevPeek36, spoken mapping `đép bít ba sáu`. No invented follower count.
