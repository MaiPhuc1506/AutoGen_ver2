# Remove repetition before measuring narration

The original 90-second cleanyourtv export contained repeated trailing labels such as “Kết nối nhanh. Kết nối nhanh.” Duration repair had accepted these as extra words. Cleaning an already exported MP4's script does not update its audio: a new full export is required.

Narration cleanup now runs before the generator checks its word budget. It removes adjacent repeated multiword phrases and both copies of short repeated labels after a substantive explanation. Single-word Vietnamese reduplication is preserved. Entirely duplicated scenes are rejected for rewriting instead of silently retaining the old speech. A validation gate catches identical sentences across distant scenes in generated drafts and reference renders; uploaded audio is left intact. Generation and duration-repair prompts require new source-backed details instead of label recaps or paraphrased padding.

This is a deterministic guard for literal repetition, not a general semantic similarity detector. The current full video is separately edited against its saved public README, measured using Edge TTS, and exported as a new 90-second copy. Nam Minh at 1.2×, ZeroTTS options, and original source assets remain available.
