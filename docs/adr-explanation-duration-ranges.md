# Three explanation levels with measured duration ranges

The Studio now offers quick (at most 60 seconds), standard (over 60 through 90 seconds), and detailed (90 through 120 seconds). Ninety seconds belongs to both standard and detailed as requested. The default is standard. Legacy imported JSON without explanationLevel keeps its exact target-duration behavior.

The preferred 45/75/105-second values are writing budgets only. After real TTS measurement, natural speech plus scene gaps and outro hold determines the duration. Inside the selected range it is retained with tempo 1. Near a boundary, at most 5% audio adjustment is allowed. Larger mismatches require a source-backed rewrite. The renderer remeasures and validates the range after review edits too. Fractional measured targets are permitted in range mode, so a 74.95-second script is not forced to 75 or 90 seconds. Standard's exclusive lower bound reserves one frame past 60 seconds.

Long GitHub hooks are shortened independently: first compact the verified identity/star introduction, then move the complete benefit sentence into the first body scene if needed. These candidates are measured using actual TTS; existing speech cache entries are reused. Repo identity and verified stars remain audible. A hook outside its timing limits still fails validation instead of silently bypassing it. Body duration repairs preserve a measured short opening.

No repeated padding, fabricated details, changed voice speed, or increased tier limits are used to pass. Sparse sources can still require a lower level; external provider outages are also still possible. Uploaded voices retain their original timing. Legacy APIs remain available, while the main Studio sends explanationLevel and disables old preset duration controls.
