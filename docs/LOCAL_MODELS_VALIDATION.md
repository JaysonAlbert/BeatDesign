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

## FLUX image editing and multiple references — 2026-10-17 follow-up

Independent QA project: `3f7de39b-53d8-481d-a029-d22fb67b3885` in the
`flux3-references` worktree (Web 3046, HTTP MCP 3047).

| Entry | References | Generation | Local job | Comfy prompt | Result |
| --- | --- | --- | --- | --- | --- |
| UI | One cup image | `4593d778-ce3a-4226-b7f1-f3740359e709` | `572df88d-4591-4d5d-8779-2dcc3d94af34` | `a7258481-9258-4d57-902a-e8b930fece9e` | 1024×1024 PNG; blue cup changed to red |
| MCP | Cup, then blue panel | `16fc2cb1-876f-4a23-8cab-dc1432f965dd` | `547c6cec-7160-4ce0-8cdb-2964dd6ee048` | `7620f001-3294-41d4-a8a6-7aa7667f6443` | 1024×1024 PNG; cup in front of blue panel |

Both actual graphs feed ordered images to `ReferenceMultiLatent` on positive
and negative conditioning, and separate letterboxed image batches to the
Qwen3.5 prompt upsampler with the official editing instruction. Source/prepared/
vision SHA-256, asset IDs and ordinals are retained in each take's provenance.
MCP refreshed both successful generations and returned project-owned assets.
Chrome showed both results after refresh, with persisted `@Image1`/`@Image2`.
The UI removed and reattached an existing image, updated the remaining count
10 → 9, and submitted the single-image edit. The reference menu offered images
only. File chooser upload has the existing extension-permission limitation
documented above; server imports and canvas attachments passed.

Reopening the completed two-image take returned the same Comfy prompt ID
without submitting; swapping reference order was rejected. Automated tests
also check changed reference bytes, aliases, project ownership, forged paths,
UI/MCP parity, deduplication, 10/11-image limits and video/audio rejection.
Graph tests cover 1, 2 and 10 reference connections plus every output ratio.

Typecheck, i18n and production build passed. Node: 441 total, 439 passed,
2 existing skips. Python duration/model runner tests: 11 passed. The fresh
worktree initially lacked generated route/i18n files and its database schema;
normal build and `db:push` setup resolved those bootstrap failures, after which
the full checks passed. No packages, weights or H3 runtime were changed.
Ten-reference inference and every ratio are not individually runtime-tested.
These are technical integration checks, not film or artistic acceptance.
