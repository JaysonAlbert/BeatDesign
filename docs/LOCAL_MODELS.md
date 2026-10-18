# Local H3 and Drama 3 preview

This fork adds local models to BeatDesign v0.2.4. It preserves the upstream
Studio, Canvas, Editor, Assets and BeatAPI catalog. Character cards, storyboard
management, approvals, keyframe generation and production planning are outside
this first integration.

## What to use

- **Canvas / Studio:** select `Local H3 · Turbo 4 · 1024×576`, supply one local
  image and a prompt. Open the composer's **Parameters** control to choose a
  native duration from 5.167 to 15.083 seconds. The default remains 158 frames at
  24 fps (6.583 seconds). For mixed references select the separate Ref2VA model
  described below; this first-frame route retains its existing fixed resolution.
- **Assets:** the `Local voice · Drama 3 INT4` form accepts a short narration,
  at most 200 characters. The WAV becomes a normal project Asset. Studio history
  retains its text, status and audio preview. Fixed voices, cloning and long-form
  narration are not implemented by this adapter.
- **Editor:** use the existing Add to timeline buttons for local video/audio.
  Timeline placement pins the concrete Asset, as upstream does.
- **Codex:** the existing MCP endpoint remains `http://127.0.0.1:3031/mcp`.
  H3 uses `bdesign_canvas_apply` and `bdesign_generation_submit`. Audio uses
  `bdesign_audio_generate({projectId, text})`; discover it with
  `bdesign_generation_models({kind: "audio"})`. Both use the same validated
  generation service and project storage as the UI. Audio submission is not
  idempotent: query history after an ambiguous response before submitting again.

Cloud model names remain available in the default mixed mode and still require their own BeatAPI key.
There is no cloud fallback from either local model. Local input paths are
resolved server-side from project membership, never accepted from client params.

## Local Ref2VA and FLUX 3 Image Klein (2026-10-17)

These are workstation-specific fork integrations, using the same Project,
Command Kernel, provider service, worker queue and project-owned output store.
Existing model IDs/effect IDs remain stable. No cloud fallback is used.

### Ref2VA — `local-h3-ref2va`

Select **Local H3 · Ref2VA · Turbo 4 · 1024×576** in the Canvas or Studio video
model picker. It uses the existing Ref2VA INT8 checkpoint, the matching Ref2V
Turbo 4 LoRA, video/audio VAEs and text encoder. It accepts 1–12 references in
total: up to 9 images, 3 videos and 3 standalone audio files. Audio-only references
are supported. Video clips must be 2–15 seconds and audio clips >0–15 seconds;
project imports may be longer, but generation rejects oversized reference clips.
Normal reference file-type/size limits also apply.

Canvas supports audio uploads and attachment of existing audio cards, with
independent `@ImageN`, `@VideoN`, `@AudioN` aliases. Reordering keeps aliases bound
to the same cards. The worker converts these aliases into native `<Picture N>`,
`<Video N>`, `<Audio N>` tags, maintaining order within each media category.
Video references supply visuals; attach soundtrack audio separately if wanted,
so embedded tracks never silently consume standalone audio ordinals.

The original source files are retained. Job-local video copies are resampled to
24 fps, scaled down to the local reference budget and stripped of embedded audio.
The native node rounds/truncates video conditioning to its temporal grid and
output length. Source/prepared hashes, effective conditioning frame counts,
asset IDs, labels and reference order are saved with the take.
Output remains 1024×576 / 24 fps with generated native audio. The same 15 H3
native duration presets apply; no arbitrary decimal duration is accepted.

MCP discovers all three reference sections and the aggregate/duration limits
through `bdesign_generation_model_get({"modelId":"local-h3-ref2va"})`.
Import each reference with `bdesign_asset_import`, attach asset cards to the
reviewed generation card using `bdesign_canvas_apply`, then submit the same
prompt/parameters/reference assets with `bdesign_generation_submit`.
When explicitly passing references to MCP, use `reference` for images, `source`
for videos and `audio_track` for audio, matching the reviewed Canvas card.
Omitting the optional references argument lets MCP derive these from that card.
Caller-supplied local paths are discarded; only server-resolved project assets
reach the worker. Duplicate asset IDs do not create extra reference ordinals.

### FLUX 3 — `local-flux3-klein`

Select **Local FLUX 3 Image Klein · BF16 · 16 steps** in the image model picker.
This integration exposes text-to-image, single-image editing and composition
from up to 10 ordered image references with the installed distilled BF16
transformer, BF16 Qwen3-VL 4B encoder, INT8 Qwen3.5 9B prompt upsampler and
FLUX.2 VAE. The upsampler runs before image generation (official task instructions,
greedy generation, up to 1024 tokens); sampling uses 16 steps / Euler / simple /
CFG 1. Bounding-box UI is outside this entry.

In Canvas / Studio, upload reference images or attach existing project images.
Use `@Image1` through `@Image10` in the prompt to identify them. Removing or
reordering references uses the existing alias handling. The server resolves
ordered project assets locally; video/audio references and foreign-project
assets are rejected. Duplicate assets consume one ordinal. The model picker
entry stays the same for all three image-generation modes.

For editing, the Qwen3.5 upsampler sees all reference images in order and uses
the official image-editing instruction, converting the user's request into an
edit/composition prompt. The native `ReferenceMultiLatent` node attaches each
image to both positive and negative conditioning at approximately 1 MP. The
selected output ratio remains independent of the first reference. Job-local
RGB PNG copies preserve aspect ratio; only the vision batch is letterboxed to
768×768 so different image shapes are never cropped to match the first image.
Original project assets are retained. Source/prepared/vision hashes and ordered
asset IDs, UI aliases and native `<ref_image_0>` ordinals are saved per take.

Accepted ratios and exact dimensions share `local-flux3.json`: 1:1 = 1024×1024,
16:9 = 1344×768, 9:16 = 768×1344, 4:3 = 1152×864, 3:4 = 864×1152.
MCP uses `modelId: "local-flux3-klein"`, `mode: "image"` and
`parameters: {"aspect_ratio":"1:1"}` on a matching Canvas generation card.
Its discovered `referenceSchema.image.max` is 10. Import with
`bdesign_asset_import`, attach image asset cards using `bdesign_canvas_apply`
and set the generation card's ordered `referenceCardIds`. Then use
`bdesign_generation_submit`; omit `references` to derive the reviewed card's
images, or explicitly supply matching `{assetId, role:"reference"}` entries.
An empty reference list retains text-to-image. UI and MCP share preflight,
reference ordering, local queue, recovery and output ingestion.
The PNG is persisted as a normal project Asset and appears in Canvas/Studio/history.

FLUX requires ComfyUI >=0.41 with native `flux3` CLIP/model support. This machine
retains H3 on 0.40 / port 8000 and uses an isolated official v0.41.0 code checkout
(commit `98cc0bf84`) / port 8002 for FLUX. The Python environment and existing
model directory are reused without package changes or another weight download.
The isolated runtime disables custom nodes. Its process is started hidden on
demand; GPU batches check queues and unload the other Comfy instance before
switching. Neither external jobs nor the WSL distribution are terminated.

Add this optional block to ignored `data/local-runtime.json` (paths are examples;
configure your actual installation):

```json
{
  "flux3": {
    "url": "http://127.0.0.1:8002",
    "python": "D:/path/to/comfy/.venv/Scripts/python.exe",
    "root": "D:/path/to/ComfyUI-0.41",
    "dataDir": "D:/path/to/isolated-flux-data",
    "modelDir": "D:/path/to/shared/models"
  }
}
```

Only loopback URLs are accepted. Required directories must exist. A missing or
incompatible runtime fails explicitly. Use a dedicated code/data checkout and
its documented requirements; do not update the H3 installation as a side effect.
The upstream model filename changed after our pinned download; the workflow uses
the verified installed underscore filenames instead of downloading renamed copies.

### Recovery and validation

Both new runners save input/template/workflow fingerprints, generated seed,
reference provenance and the Comfy prompt ID. A recovered take must match its
inputs, server and saved graph. An ambiguous submit checks the saved client ID
in queue/history and stops if it cannot identify exactly one original prompt;
it never automatically submits a second take. Existing outputs are verified
against provenance; a crash after download can finish the original receipt.

Technical QA uses an independent project and synthetic references, preserving
film `production.pause` files and all film takes. Source tests cover UI/MCP parity,
project isolation, forged paths, deduplication, reference limits, audio ordinals,
workflow wiring, uncertain-submit recovery and FLUX ratio/upsampler settings.
Live QA covers mixed-media Ref2VA and FLUX inference plus project ingestion;
maximum-reference batches, every duration/ratio and artistic quality are separate
validation boundaries. See `LOCAL_MODELS_VALIDATION.md` for dated receipts.

Workflow sources: [ComfyUI native H3 node](https://github.com/Comfy-Org/ComfyUI/blob/v0.40.0/comfy_extras/nodes_minimax_h3.py),
[official FLUX model card](https://huggingface.co/black-forest-labs/flux-3-image-klein-comfy),
[official distilled T2I template](https://github.com/Comfy-Org/workflow_templates/blob/main/templates/image_flux3_klein_distilled_t2i.json),
[official editing template](https://huggingface.co/black-forest-labs/flux-3-image-klein-comfy/blob/main/workflows/image_flux3_klein_distilled_image_edit.json).
`scripts/workflows/local-flux3-prompts.json` retains the `t2i` and `i2i`
instructions from Black Forest Labs' Apache-2.0
[prompt upsampler](https://huggingface.co/black-forest-labs/flux-3-image-klein-pup/blob/main/system_prompts.json)
as workflow data (retrieved 2026-10-17). Weights retain their existing licenses.

## Reuse the configured standalone runtime

The configured runtime provides the existing local adapters and service helpers.
This machine now uses the standalone `comfy-videos/tools/local_runtime` copy.
Legacy `openmontageRoot` is a compatibility configuration key, not a dependency
on the retired application.
Codex remains the Agent; BeatDesign owns its projects/history/assets. Only the
model execution helpers and GPU lease are shared. Do not archive that runtime
checkout while BeatDesign uses it.

Required files in that existing checkout:

```
lib/local_runtime.py
lib/local_services.py
tools/video/local_h3_video.py
tools/audio/drama3_local_tts.py
tools/_comfyui/client.py
.local/integration.json
workflows/local-h3-turbo4.json
```

The runtime config already points to the existing Windows ComfyUI installation,
WSL Drama 3 launcher/checkpoint, workflow hash and FFmpeg/ffprobe. No new model
weights or global Python packages are installed by this fork. A fresh clone of
this fork alone is not a self-contained model runtime.

Create ignored `data/local-runtime.json` (or under `BEATDESIGN_DATA_DIR`):

```json
{
  "python": "D:/path/to/existing/controller/.venv/Scripts/python.exe",
  "openmontageRoot": "D:/path/to/existing/local-adapter-checkout",
  "ffmpeg": "D:/path/to/existing/ffmpeg.exe",
  "ffprobe": "D:/path/to/existing/ffprobe.exe"
}
```

Select the workstation provider at startup. The browser receives the server's
provider/mode on page load, so changing modes no longer requires rebuilding:

```text
BEATDESIGN_GENERATION_PROVIDER=workstation
```

Setup with Node >=22 and pnpm 10.32.1:

```powershell
pnpm install --frozen-lockfile
pnpm db:push
pnpm build
pnpm local:start
```

### Local-only startup mode

To hide cloud models from Canvas image/video nodes, Studio, API model lists and
MCP model discovery, launch with either:

```powershell
pnpm local:start --local-only
```

or set a local environment variable:

```powershell
$env:BEATDESIGN_LOCAL_ONLY = '1'
pnpm local:start
```

For a persistent workstation setting, add `BEATDESIGN_LOCAL_ONLY=1` to the
Git-ignored `.env.local` in this checkout. `local:start` loads `.env.local` and
then `.env`, preserving existing shell variables, and forwards the configuration
to both web and MCP. The CLI flag takes precedence over the environment.
`BEATDESIGN_LOCAL_ONLY` also works with `pnpm dev`, `pnpm start` and `pnpm mcp:http`
when exported in their process environment; set it for both web and MCP.

Local-only mode selects `workstation` automatically. Image generation defaults
to the integrated local FLUX 3 model; video offers local H3 first-frame and
Ref2VA, and local Drama 3 audio remains available. These are the fork's registered
local integrations, not an automatic scan of every downloaded checkpoint.
Existing local runtime/file validation still runs before generation.
Cloud image/video/analysis requests are rejected before upload or submission,
including saved cloud-model nodes and direct API/MCP requests. Existing project
assets, node data and generation history are retained.

Use `BEATDESIGN_LOCAL_ONLY=0` (or `pnpm local:start --local-only=false`) for the
previous mixed workstation catalog. Values `true`/`false` are also accepted;
other nonempty values fail explicitly. Stop and restart both web and MCP when
changing the setting, then reload the browser. The launcher leaves occupied
ports untouched and warns that existing services need restarting.

`VITE_GENERATION_PROVIDER` remains a compatibility fallback when no runtime
provider is supplied; a runtime setting takes precedence over that build flag.

`local:start` starts hidden loopback web/MCP processes, logs under `data/`, and
leaves already responding ports untouched. It does not start either GPU model
until a generation is submitted. Open `http://127.0.0.1:3020/`.
Optional `ffmpeg` and `ffprobe` paths enable the existing MCP frame-extraction
and timeline-render tools without changing the system PATH.
Before rebuilding on Windows, stop only this checkout's web process; otherwise
the loaded SQLite native library prevents replacing `.output`.

## Queue, failure and recovery

- One worker owns the queue. It drains waiting jobs of the current model before
  switching to another model. Submit a batch's H3 tasks before its TTS tasks.
  It does not infer future story stages or wait for tasks not yet submitted.
- It uses the existing cross-process GPU lease, including other consumers of the configured standalone runtime,
  and checks ComfyUI's queue before switching. External ComfyUI work is never
  cancelled. The lease cannot prevent manual submissions from other software.
- H3 model memory is released before Drama 3 loads. The integration-owned Drama
  service is stopped after its batch. It never shuts down the WSL distribution.
- Jobs, source parameters, workflow/prompt IDs, provenance and results live in
  ignored `data/local-jobs/<id>/`. SQLite retains the project generation record.
- Polling wakes the worker after a restart. H3 can resume a recorded Comfy prompt
  ID. Interrupted TTS is marked failed rather than silently generating twice.
  A successful output is copied into project-owned storage and linked to history.
- Check Studio history after a lost HTTP response before retrying. Repeating a
  new request creates a new take. This preview does not offer queue cancellation
  or full crash-transaction recovery across the remote Comfy submit boundary.

## Native H3 duration selection

H3 uses a `17k+5` frame grid at 24 fps. The installed
`comfy_extras/nodes_minimax_h3.py` reports a trained range of approximately
124–362 frames. The broader node input limit is not a tested model range;
BeatDesign exposes only these 15 native presets, rounded to milliseconds:

| Duration value | Frames | Duration value | Frames | Duration value | Frames |
| --- | --- | --- | --- | --- | --- |
| `5.167s` | 124 | `8.708s` | 209 | `12.25s` | 294 |
| `5.875s` | 141 | `9.417s` | 226 | `12.958s` | 311 |
| `6.583s` | 158 | `10.125s` | 243 | `13.667s` | 328 |
| `7.292s` | 175 | `10.833s` | 260 | `14.375s` | 345 |
| `8s` | 192 | `11.542s` | 277 | `15.083s` | 362 |

The [official ComfyUI native workflow guide](https://github.com/Comfy-Org/docs/blob/main/tutorials/video/minimax/minimax-h3-native.mdx)
documents the same frame grid. Display values identify exact frame counts;
they do not trim, slow down or speed up a fixed-length output. Approximate
unlisted values such as `5s`, `10s` and `15s` fail validation. Longer clips use
more time and GPU memory. Only the two endpoints and the 141-frame MCP path
were newly generated during this validation; the remaining presets were checked
against the installed node's actual `temporal_shape` function and shared service
tests, rather than individually generated.

UI and MCP read one source-level duration table. Discover the current accepted
values with `bdesign_generation_model_get({"modelId":"local-h3"})`; its
`parameterSchema.wmDuration` includes `values`, `fps` and `frameCounts`.
Set a reviewed Canvas generation card's `duration` using `bdesign_canvas_apply`
(`upsert_card`), then submit that same value as `parameters.wmDuration` through
`bdesign_generation_submit`. For example, `"10.125s"` selects 243 frames.
Preserve the card's other fields when using `upsert_card`.

The queue derives a job-local template and runtime configuration after verifying
the original template's hash, node types, resolution, baseline frame count and
fps. It changes only the length field, keeping shared runtime files untouched.
The existing adapter still owns GPU locking, submission and prompt-ID recovery.
Recovered workflows must match the requested duration, and completed or recovered
outputs must match the selected frame count and 24 fps before success is reported.
The job's provenance retains the selected preset and actual timing.

Validation on 2026-10-17, existing RTX 5090 / FL2VA INT8 / Turbo 4 / 1024×576:
124-frame and 362-frame samples returned 5.166667 s and 15.083333 s video streams;
both retained native audio and fully decoded. A real HTTP MCP submission of
`5.875s` completed through the queue with 141 frames and matching provenance.
Canvas selection, refresh persistence, UI-to-MCP reads and live MCP-to-UI updates
passed; Studio selected the longest preset. Typecheck, i18n and production build
passed; Node suite: 429 passed, 2 skipped. Python duration/runtime tests: 5 passed.
The live check also exposed a Canvas status-write issue when a UI projection
placed a pinned output URL on the generation config card. MCP now clears that
projection on config writes and retains media ownership on the existing output
node, so refreshing a completed task does not replay a URL without an Asset ID.

## Validation in this installation

The browser submitted one H3 job and one Drama 3 job. The latter waited for H3,
then returned a WAV after the model switch. Both appeared in the same Assets
page. MCP created the project and visible reference/generation nodes. Automated
tests cover local reference delivery without network upload, project isolation,
supported parameter limits, task-bound output ingestion and audio asset type.
Creative quality and native-English listening acceptance remain for human review.

## Follow-up reuse from the existing story scripts

### Fixed-reference narration in this fork

For the workstation's authenticated remote MCP gateway, `bdesign_asset_upload`
accepts canonical base64 media in 512 KiB decoded chunks. An upload UUID is bound
to the project, filename, total byte length and SHA-256; identical chunks can be
retried, conflicting bytes are rejected. The file limit is 64 MiB. Final import
uses the existing project Asset service and ownership checks. This transports
only explicitly supplied bytes and does not expose the blocked host-path import
tool or change gateway/HTTP authentication. Keep upload receipts for recovery.

`bdesign_audio_generate` accepts `referenceAssetId` plus its verbatim `referenceText`,
and optional `maxNewTokens` (32–256, default 256), `temperature` (0–2), and `topP` (0–1, exclusive zero).
Text remains limited to 200 characters per take. Omit both reference fields to
retain unconditioned generation. UI/API asset-first requests use an `audio_track`
reference and `reference_text`, `max_new_tokens`, `temperature`, `top_p` parameters.
The shared preflight enforces project ownership, local audio media and one
reference. The worker validates a decodable 0–30 second reference and records its
Asset ID, SHA-256, exact transcript, parameters and input fingerprint for each take.
It maps Windows drive paths to the existing WSL Drama service. No client-supplied
filesystem path, remote provider fallback or separate project state is introduced.
Interrupted/ambiguous TTS requests are not automatically repeated. Restart web/MCP
after installing this code. Actual voice quality and listening acceptance remain
distinct from automated request/provenance checks.

The story-production handoff was reviewed separately. The pinned H3 output keeps
its original audio and native duration; adding narration does not replace that
source Asset. Do not import the old story scripts as libraries: several execute
production work at module load. Future work can extract fixed reference voice,
per-sentence redo, full narration audition, ASR checks, contact sheets and sound
mixing into explicit callable services. None is claimed as completed here, and
the story's selected voice or existing takes are not changed by this integration.

The fork also fixes Windows setup/test assumptions: postinstall shell commands,
path comparisons, directory junction tests, executable invocation, process exit
semantics, CRLF frontmatter and delayed SQLite lock cleanup.
