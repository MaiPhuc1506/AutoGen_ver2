# DevPeek36 publishing defaults

User preference: hashtags must be exactly `#Ai #Github #xuhuong #DevPeek36`, in that order and casing. New Studio sessions, sample scripts, fallback script generation and LLM-generated drafts start at voice speed `1.2`.

Backend defaults are shared in `src/channel-defaults.ts`. Both web and CLI pipelines write matching `caption.txt`; publish checklists use the same hashtags unless an explicit custom list is supplied. The library fallback caption uses the same four tags. Uploaded recordings and existing saved scripts retain their stored audio/settings; existing captions are not bulk rewritten.

Validation: `npx tsc --noEmit` passed; `npm test` passed 214 tests in 42 files. JavaScript syntax and `git diff --check` passed. Live port 3002 served the speed input at `1.2` and label `1.20x`. Direct checks confirmed exact hashtag order/casing and retained explicit custom hashtag support. A short local ZeroTTS render in `output/devpeek36-defaults-validation/` verifies publishing files from the real pipeline.
