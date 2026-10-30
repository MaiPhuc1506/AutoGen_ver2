# Repository image and opening identity layout

The opening source label reused `visual-asset`, whose generic styling creates a large card. It covered the repository pill and benefit in the exported video. Product logos inherited the same class on the glass container. Both now use dedicated opening classes. The name, repository and benefit live in a vertical identity group with measured spacing and a bounded height, including long names. Caption space remains reserved below the group.

Fresh web drafts automatically resolve a project image. Discovery prefers clearly identified raster logos in the README, then a main application icon in the repository tree. Screenshots with “icon” in their descriptions and add-on icons are excluded. Discovered images are saved as local Studio assets, placed in the hook as `presentation: logo`, and copied into the portable render. Explicit opening logos are preserved. Without a dedicated project logo, a labelled owner avatar is the fallback. Channel branding is independent.

The existing raster-only upload rule stays in place. A repository with only an SVG logo currently falls back to its owner avatar. No logo is invented. HTTP readers remain injectable for offline tests.

Validation uses real Chrome bounds for short and long repository names, checks image loading, and performs an actual opening render. The corrected 90-second MP4 replaces only the first 130 frames at 24 fps and reuses the original narration/audio stream and subsequent scenes; full HTML/script artifacts use the updated renderer for future exports.
