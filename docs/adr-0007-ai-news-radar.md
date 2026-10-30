# AI News Radar — reuse ingest and Studio

2026-10-30

## Decision
Extend the existing Express/TypeScript ingest layer. `/api/radar` aggregates public RSS/Atom and APIs; `/api/feeds` and the legacy RSS/Batch interface remain available. Radar Import dispatches to the existing URL tab and `/api/extract-url`, then the existing Studio review/generation flow. It does not generate scripts from headlines or RSS previews automatically.

`fetchSourceContent` is shared by web URL extraction and script generation. Platform adapters read public Reddit posts (OAuth when supplied, otherwise public RSS if accessible), HN stories, Product Hunt RSS/public article content, Hugging Face model/dataset/Space READMEs and blog posts, arXiv abstracts, official/public HTML blogs, X API posts only with authorized credentials, and public Telegram text posts. Scope is displayed with extracted content. No model/code execution, private-group access, CAPTCHA bypass, full PDF parsing, or invented summaries.

## Discovery and ranking
- Existing configured publisher feeds, Dân Trí, TechCrunch AI, OpenAI, Google AI, Hugging Face Blog, arXiv cs.AI/cs.LG/cs.CL, Product Hunt, GitHub search, Hugging Face models/Spaces, HN Algolia, Reddit public RSS/OAuth.
- X search only when X_BEARER_TOKEN is configured; Telegram discovery only for explicitly configured public channel usernames.
- General publisher/Product Hunt feeds use a deterministic AI keyword filter. This is a discovery heuristic, not AI classification, and can miss or misclassify articles.
- GitHub list is recently active repositories with topic artificial-intelligence, sorted by total stars; it is not GitHub's official Trending or star-growth data. HF lists use the public trendingScore API ordering. Cards retain real likes/stars/points. Cross-source trending is a transparent proxy: log10(1+signal)/(1+ageDays/7). Items without a signal follow scored items; unknown dates stay unknown.
- Deduplicate normalized tracking-free URLs or normalized titles; preserve source provenance and duplicate counts. No claim of semantic/cross-language duplicate detection.

## Operational behavior
In-flight scans are coalesced, concurrency is four, network responses are capped at 3 MB and 12 seconds, and snapshots (including source failures) cache for five minutes. Refresh and filter requests reuse the cache. The browser refreshes every five minutes only while Radar is active and visible. Results render in batches of 30. All failures/unconfigured integrations are visible per source. No Gemini calls are made for discovery or importing.

Public URL validation rejects local/credential-bearing/non-HTTP targets. Resolved private IPs are blocked at connection time including redirects; authenticated requests never redirect. HTTP client is injectable; tests use mocks/Nock and never call real services. Optional credentials are read server-side from the environment, never returned in status JSON or logs. No new dependency.

## Verification
See `.cache/radar-validation/validation.md` for actual test/live/UI/render results. External sources may be blocked, stale, rate-limited or unavailable; dashboard does not substitute fake data.

## Primary API references checked
- https://huggingface.co/docs/hub/en/api and its linked OpenAPI reference
- https://github.com/HackerNews/API (story imports); https://hn.algolia.com/api (discovery)
- https://info.arxiv.org/help/rss.html
- https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki
- https://core.telegram.org/widgets/post
- https://github.com/xdevplatform/docs/blob/main/x-api/posts/search/quickstart/recent-search.mdx
