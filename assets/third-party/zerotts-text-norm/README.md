# ZeroTTS text normalization rules

Vendored unchanged from the locally installed zerotts 0.1.5 package (file hashes pinned in manifest.json), from https://github.com/zeroweight-ai/ZeroTTS.

Only `text_norm/vi_normalizer.py`, its abbreviation data and both license notices are included. ZeroTTS is MIT (LICENSE.ZeroTTS); abbreviation/rule provenance credits soe-vinorm, MIT (data/LICENSE.soe-vinorm). No models, ONNX, torch, network calls, package installation or voice inference are used by the normalizer.

AutoGen loads this stdlib-only module through scripts/normalize-speech.py. Project-specific term protection, units and decimal handling live separately in src/tts/smart-pronunciation.ts.
