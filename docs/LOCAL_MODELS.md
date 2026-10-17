# Local H3 and Drama 3 preview

This fork adds two local models to BeatDesign v0.2.4. It preserves the upstream
Studio, Canvas, Editor, Assets and BeatAPI catalog. Character cards, storyboard
management, approvals, keyframe generation and production planning are outside
this first integration.

## What to use

- **Canvas / Studio:** select `Local H3 · Turbo 4 · 1024×576`, supply one local
  image and a prompt. Open the composer's **Parameters** control to choose a
  native duration from 5.167 to 15.083 seconds. The default remains 158 frames at
  24 fps (6.583 seconds). Other H3 modes/resolutions are not exposed.
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

Cloud model names remain available and still require their own BeatAPI key.
There is no cloud fallback from either local model. Local input paths are
resolved server-side from project membership, never accepted from client params.

## Reuse the existing runtime

This first version deliberately reuses the already tested OpenMontage local
adapter checkout. It does **not** require an OpenMontage web server or main Agent.
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

Set these before building and starting, or put them in ignored `.env.local` for
Vite. MCP needs the server environment variable as well:

```text
VITE_GENERATION_PROVIDER=workstation
BEATDESIGN_GENERATION_PROVIDER=workstation
```

Setup with Node >=22 and pnpm 10.32.1:

```powershell
pnpm install --frozen-lockfile
pnpm db:push
pnpm build
pnpm local:start
```

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
- It uses the existing cross-process GPU lease, including OpenMontage's lease,
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
