# Local H3 and Drama 3 preview

This fork adds two local models to BeatDesign v0.2.4. It preserves the upstream
Studio, Canvas, Editor, Assets and BeatAPI catalog. Character cards, storyboard
management, approvals, keyframe generation and production planning are outside
this first integration.

## What to use

- **Canvas / Studio:** select `Local H3 · Turbo 4 · 1024×576`, supply one local
  image and a prompt. This is the existing pinned I2V workflow: 158 frames at
  24 fps, approximately 6.58 seconds. Other H3 modes/resolutions are not exposed.
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
