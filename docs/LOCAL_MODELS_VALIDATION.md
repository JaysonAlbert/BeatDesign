# Local Ref2VA and FLUX 3 validation

Date: 2026-10-17 (Asia/Shanghai). This is workstation fork validation, separate
from upstream release status and human creative acceptance.

The isolated QA worktree is `BeatDesign-worktrees/local-h3-ref2va`, with its own
SQLite/project assets/jobs, Web 3046 and HTTP MCP 3047. The initial source baseline
was `8594af6`. Test media are synthetic: a blue rectangle, a 2-second 30 fps test
pattern, and a 2-second sine tone. No film take or production pause was changed.

## Actual inference and project ingestion

| Model / submission | Generation ID | Worker job ID | Verified output |
| --- | --- | --- | --- |
| Ref2VA / Chrome UI | `bef016a3-29ff-4961-9d2f-7acc491ce3bd` | `f4779a3e-426e-4ca3-af4f-1339ac368296` | 1024×576, 124 frames, 24 fps, native audio |
| Ref2VA / HTTP MCP | `11cab7de-3026-4ff2-98f0-24a0daa8563e` | `ef1c1d1c-d904-4e45-b532-cbdf60bc0861` | 1024×576, 141 frames, 24 fps, native audio |
| FLUX 3 / HTTP MCP | `5a063269-1c2d-4fe3-abf2-cea36bf1499b` | `188bb6d1-979f-4ca3-ac44-74eddad27712` | 1024×1024 PNG |
| FLUX 3 / Chrome UI | `23f1510b-cd27-45c6-90b5-8c4cc006aa05` | `3571a84f-04ed-416b-a33a-7b56f726f98c` | 1152×864 PNG (4:3) |

All four tasks succeeded and were localized to project-owned assets in project
`6aee7450-6771-4800-a6e2-7f47f9c43234`. Both Ref2VA tasks used all three media
types together, including resampling the 30 fps reference video to 24 fps.
Both video files fully decoded without errors. PNG dimensions were probed and
the first FLUX output was visually inspected. FLUX's actual worker ran the
installed INT8 prompt upsampler and 16-step BF16 distilled model.

`data/qa-results.json`, `qa-media-checks.json`, `qa-recovery.json`,
`qa-ref2va-model-picker.png`, and each worker take's graph/history/provenance
retain local evidence. These generated artifacts remain ignored, not Git assets.

## UI and MCP checks

- Chrome showed the original local H3 and the new Ref2VA in the video picker,
  and FLUX 3 in the image picker alongside the existing cloud catalog.
- Ref2VA displayed `@Image1`, `@Video1`, `@Audio1`, native duration choices and
  image/video/audio upload options with remaining counts.
- Attaching an existing project audio card through the UI created the edge,
  showed `@Audio1`, and reduced the audio remaining count from 3 to 2.
- The audio upload action opened its file chooser. Automated file selection was
  blocked by Chrome extension file-URL access permissions. No extension setting
  was changed; that final browser upload step is unverified. Server audio import,
  reference compilation and actual audio-conditioned inference passed.
- MCP discovered both model schemas, submitted the reviewed Ref2VA and FLUX
  nodes, refreshed successful status, and returned project-owned outputs.
- UI refreshed and displayed MCP-produced outputs. Web/MCP restart preserved
  the QA project's cards/assets/history. Existing completed takes passed runner
  recovery checks; changing the prompt was rejected by the input fingerprint.
- Ambiguous-submit queue recovery/no-match refusal is covered with mocked queue
  and history responses. No deliberate Comfy server crash was induced.

## Source and environment checks

- Typecheck, complete Node tests, i18n check and production build.
- Node tests: 439 total, 437 passed, 2 existing skips.
- Python duration/model runner tests: 9 passed.
- Native H3 workflow validation: no errors or warnings, no partner/API nodes.
- FLUX graph class/required-input/enum checks passed against the isolated live
  instance before inference; actual submission then verified the graph end to end.
- H3: existing ComfyUI 0.40.0 on port 8000.
- FLUX: official ComfyUI v0.41.0 (`98cc0bf84`) source worktree on port 8002,
  isolated data, custom nodes disabled, existing Python/weights reused.
- GPU batching and memory release switched H3 → FLUX → H3 → FLUX successfully.

Only 124/141-frame Ref2VA and square/4:3 FLUX outputs were generated in this
change's QA. Full reference-count limits and every duration/ratio were not
individually inferred. These receipts establish integration and media validity,
not artistic fidelity, audio quality, or film acceptance.
