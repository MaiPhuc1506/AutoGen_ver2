# Spoken repository names

The display spelling of a repository remains canonical in voiceText, hooks, templateData and captions. Only the text sent to TTS receives a phonetic reading. The user's approved reading is `cleanyourtv` / `Clean Your TV` → `cờ lin do ti vi`.

Resolution for new AI scripts happens once before narration timing: explicit per-video overrides, the existing pronunciation dictionary/acronyms, fully recognized English compounds, then a small JSON-only request through the configured LLMProvider for unfamiliar names. That last request sends only the canonical repository name, not the README. The returned reading is validated and stored under voice.pronunciationOverrides; previews, measured duration, narration repairs, Studio voice choices and direct renders retain it. User overrides win case-insensitively. No further LLM request occurs during rendering or for each scene.

Smart normalization also recognizes fully covered camelCase, joined, hyphenated and underscored compounds such as AutoVideoGen. It does not split partially recognized brands or replace arbitrary Vietnamese words. Unknown compounds require the automatic LLM reading when generating an AI script. Audio uploads and original-pronunciation mode retain their behavior. No voice models, provider options, default speed or dependencies changed; ZeroTTS remains selectable.

AI readings are approximate pronunciations, not author-certified brand pronunciations. Explicit corrections always take priority. Synthesis cache fingerprints include the actual spoken text, and phonetic expansions map back onto the original caption token using real word boundaries.

Validation output: output/repo-pronunciation-validation/. The live configured Gemini call returned a reading for the public name PersonaLive. Standalone Latin tail consonants are expanded to Vietnamese syllables without altering accented Vietnamese letters. Tests cover unknown names through a fake provider, compound splitting, override precedence, preserved display spelling, caption spans, and saved pronunciation with a selected ZeroTTS voice.

The live revised hook measured 5.472 seconds with Nam Minh at 1.2×. Its submitted TTS text begins “cờ lin do ti vi”, while display/captions retain “cleanyourtv”. The original caption token spans the complete five-syllable name from 0.100–1.037 seconds; timing reports high accuracy. The restarted web pronunciation endpoint returned HTTP 200 with the same spoken text, and its actual name-only preview is saved as repo-name.mp3. TypeScript exited 0 and the complete final suite passed 279 tests in 57 files.

The final real sample render completed: ffprobe confirms 1080×1920, 24fps, audio present and 9.625 seconds. Logs and probe output are saved under output/repo-pronunciation-validation/checks/.
