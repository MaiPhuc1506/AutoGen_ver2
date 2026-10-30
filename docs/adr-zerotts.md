# ZeroTTS local voice provider

## Decision

Add ZeroTTS as an optional `TtsClient` provider. The existing TypeScript/Node/HyperFrames pipeline remains unchanged in structure. Studio selects ZeroTTS for new work; existing scripts and CLI environment defaults remain compatible with Edge. No npm runtime dependency was added.

The upstream engine is a Python SDK, so an isolated `.zerotts-venv` runs a small loopback bridge. Installing `zerotts==0.1.5` is justified by the requested local Vietnamese voice generation. It does not install the upstream Gradio application or PyTorch. We retain the upstream license and notice in `assets/third-party/`.

Model revision: `c2bfbd67dc648cac455077333f7cf5c18a2e3bb4`. Model snapshots are materialized as real neighbouring files: ONNX external weights failed validation when loaded through Hugging Face blob symlinks. The local cache and materialized copy currently occupy about 1.7 GB, excluding the virtual environment. All model, runtime and virtual-environment folders are gitignored.

## Voice and pronunciation

Eight bundled presets are exposed, with Quang Minh selected initially. Text passes through the existing pronunciation dictionary only at the speech boundary. Display text stays canonical. The worker uses native synthesis without applying the SDK's optional Vietnamese text normalizer again. Scene text is split into short segments and concatenated with small gaps; the existing speed and duration-fit stages remain responsible for final pacing.

User-specified readings are OpenDesign → `ô bình đi zai`, Agent → `ây chình`, and DevPeek36 → `đép bít ba sáu`. Per-video overrides can replace global readings. An existing project with an old override must be updated explicitly. Changing engine does not guarantee every English proper noun sounds right; the pronunciation review and listen controls remain necessary. Substituted speech uses estimated canonical caption timing.

Cache identity includes the spoken text, voice preset and model revision. No silent fallback to another provider is allowed. Existing user recordings are not overwritten.

## Local bridge

The worker binds only to 127.0.0.1, port 7821 by default. A generated local token protects synthesis requests, and browser Origin requests are rejected. Input length and voice IDs are bounded. Requests cannot supply model paths, code, remote URLs or voice ZIP archives. Model calls are serialized. Narration and authorization headers are not logged. The first run downloads model files; synthesis subsequently runs locally.

Voice cloning is outside this integration: the upstream preset encoder is not published. We use the eight supplied presets.

## Sources

- [Upstream SDK and model](https://github.com/zeroweight-ai/ZeroTTS)
- [Bundled voices](https://github.com/zeroweight-ai/ZeroTTS/blob/main/docs/VOICES.md)

## Validation

See `zerotts-validation.md` for actual checks and artifacts. External synthesis is mocked in Vitest; real model generation is validated separately.
