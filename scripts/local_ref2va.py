"""Local Ref2VA runner using the configured runtime's client, lease and probing.

Only project-resolved references reach this worker. Each take saves its input
fingerprint, reference hashes/order, graph and submission receipt before polling.
"""
import hashlib
import json
import mimetypes
from pathlib import Path
import re
import subprocess
import time

from local_h3_duration import resolve_timing, verify_h3_output

ROOT = Path(__file__).resolve().parents[1]
LIMITS = json.loads((ROOT / 'src/core/generation-providers/local-h3-ref2va.json').read_text())
TEMPLATE = ROOT / 'scripts/workflows/local-h3-ref2va.json'


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def resolve_prompt(prompt):
    return re.sub(r'@(Image|Video|Audio)(\d+)\b',
                  lambda m: '<{} {}>'.format({'Image': 'Picture', 'Video': 'Video', 'Audio': 'Audio'}[m[1]], m[2]), prompt)


def describe_inputs(inputs):
    references = inputs.get('_localReferences', [])
    if not isinstance(references, list) or not 1 <= len(references) <= LIMITS['total']:
        raise ValueError('Ref2VA requires 1–12 project references')
    counts = dict(image=0, video=0, audio=0)
    described = []
    for ref in references:
        kind = ref['type']
        if kind not in counts:
            raise ValueError('Unsupported reference type')
        counts[kind] += 1
        if counts[kind] > LIMITS[kind]:
            raise ValueError('Too many {} references'.format(kind))
        path = Path(ref['path']).resolve(strict=True)
        described.append({**ref, 'path': str(path), 'sha256': sha256(path),
                          'label': '<{} {}>'.format({'image': 'Picture', 'video': 'Video', 'audio': 'Audio'}[kind], counts[kind])})
    return {'prompt': inputs['prompt'], 'resolvedPrompt': resolve_prompt(inputs['prompt']),
            'timing': resolve_timing(inputs.get('wmDuration')), 'references': described,
            'seed': inputs.get('seed'), 'templateSha256': sha256(TEMPLATE)}


def input_fingerprint(spec):
    return hashlib.sha256(json.dumps(spec, sort_keys=True, ensure_ascii=False).encode('utf8')).hexdigest()


def validate_reference(ref, media):
    kind = ref['type']
    if not any(s['codec_type'] == ('video' if kind == 'image' else kind) for s in media.get('streams', [])):
        raise ValueError('Reference contents do not match its {} type'.format(kind))
    if kind != 'image':
        duration = float(media['format'].get('duration', 0))
        minimum = LIMITS['videoMinSeconds'] if kind == 'video' else 0
        maximum = LIMITS['videoMaxSeconds'] if kind == 'video' else LIMITS['audioMaxSeconds']
        if not minimum <= duration <= maximum or duration <= 0:
            raise ValueError('{} reference duration must be {}–{} seconds'.format(kind, minimum, maximum))


def build_workflow(spec, staged, seed, prefix):
    graph = json.loads(TEMPLATE.read_text(encoding='utf8'))
    graph['6']['inputs'].update(prompt=spec['resolvedPrompt'], length=spec['timing']['frames'])
    graph['7']['inputs']['noise_seed'] = seed
    graph['15']['inputs']['filename_prefix'] = prefix
    counts = dict(image=0, video=0, audio=0)
    for ref, name in zip(spec['references'], staged, strict=True):
        kind = ref['type']
        index = counts[kind]
        counts[kind] += 1
        node = str(100 + len(graph))
        if kind == 'image':
            graph[node] = {'class_type': 'LoadImage', 'inputs': {'image': name}}
            connection = [node, 0]
        elif kind == 'audio':
            graph[node] = {'class_type': 'LoadAudio', 'inputs': {'audio': name}}
            connection = [node, 0]
        else:
            graph[node] = {'class_type': 'LoadVideo', 'inputs': {'file': name}}
            components = str(int(node) + 1)
            graph[components] = {'class_type': 'GetVideoComponents', 'inputs': {'video': [node, 0]}}
            connection = [components, 0]
        # Video soundtracks are opt-in standalone audio references. They do not
        # consume hidden Audio ordinals or change the UI's @AudioN numbering.
        graph['6']['inputs']['ref_{}s.ref_{}_{}'.format(kind, kind, index)] = connection
    return graph


def recover_submission(client, receipt):
    import requests
    if receipt.get('prompt_id'):
        return receipt['prompt_id']
    # A crash/timeout across POST /prompt is ambiguous. Look for the persisted
    # client ID first; absence must never cause an automatic second submission.
    matches = set()
    queue = requests.get(client.server_url + '/queue', timeout=15)
    queue.raise_for_status()
    for row in queue.json().get('queue_running', []) + queue.json().get('queue_pending', []):
        if row[3].get('client_id') == receipt['client_id']:
            matches.add(row[1])
    history = requests.get(client.server_url + '/history', timeout=30)
    history.raise_for_status()
    for prompt_id, entry in history.json().items():
        if entry.get('prompt', [None] * 4)[3].get('client_id') == receipt['client_id']:
            matches.add(prompt_id)
    if len(matches) != 1:
        raise RuntimeError('Submission outcome is uncertain; inspect ComfyUI queue/history before a new attempt')
    return matches.pop()


def execute_ref2va(inputs, output):
    import requests
    from lib.local_runtime import bootstrap, probe_media, write_json
    from tools._comfyui.client import ComfyUIClient
    from tools.base_tool import ToolResult
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    cfg = bootstrap()
    client = ComfyUIClient(server_url=cfg['comfyui_url'])
    spec = describe_inputs(inputs)
    fingerprint = input_fingerprint(spec)
    state_path = output.with_suffix('.ref2va.json')
    state = json.loads(state_path.read_text(encoding='utf8')) if state_path.exists() else None
    if state and (state['fingerprint'] != fingerprint or state['server_url'] != client.server_url):
        raise ValueError('Ref2VA inputs changed; refusing to recover a different take')
    if state and sha256(output.with_suffix('.workflow.json')) != state.get('workflowSha256'):
        raise ValueError('Saved Ref2VA workflow changed; refusing to resume')
    if output.exists() and output.with_suffix('.provenance.json').exists():
        if not state or not state.get('prompt_id'):
            raise ValueError('Existing Ref2VA output has no matching submission receipt')
        data = json.loads(output.with_suffix('.provenance.json').read_text(encoding='utf8'))
        if data['sha256'] != sha256(output) or data['inputFingerprint'] != fingerprint:
            raise ValueError('Recovered Ref2VA output does not match provenance')
        data['timing'] = verify_h3_output(output, inputs.get('wmDuration'))
        return ToolResult(success=True, data=data)
    if state:
        prompt_id = recover_submission(client, state)
        graph = json.loads(output.with_suffix('.workflow.json').read_text(encoding='utf8'))
    else:
        if output.exists():
            raise ValueError('Refusing to overwrite an untracked Ref2VA output')
        queue = requests.get(client.server_url + '/queue', timeout=10)
        queue.raise_for_status()
        if queue.json().get('queue_running') or queue.json().get('queue_pending'):
            raise RuntimeError('ComfyUI has existing work; leave it untouched and retry when idle')
        staged = []
        for index, ref in enumerate(spec['references']):
            path = Path(ref['path'])
            validate_reference(ref, probe_media(path))
            if ref['type'] == 'video':
                # Native H3 expects 24 fps frame tensors, never blindly treat
                # an arbitrary source frame rate as 24 fps or load a long movie.
                path = output.parent / ('reference-{}-24fps.mp4'.format(index))
                subprocess.run([cfg['ffmpeg'], '-v', 'error', '-nostdin', '-y', '-i', ref['path'],
                                '-an', '-vf', 'fps=24,scale=1024:576:force_original_aspect_ratio=decrease:force_divisible_by=32',
                                '-c:v', 'libx264', '-pix_fmt', 'yuv420p', str(path)],
                               check=True, capture_output=True, timeout=180)
                ref['preparedSha256'] = sha256(path)
                ref['preparedFrames'] = int(next(s for s in probe_media(path)['streams'] if s['codec_type'] == 'video')['nb_frames'])
                used = min(ref['preparedFrames'], spec['timing']['frames'])
                ref['conditioningFrames'] = used - ((used - 5) % 17)
            name = 'beatdesign-ref-{}{}'.format(sha256(path)[:24], path.suffix.lower())
            with path.open('rb') as stream:
                response = requests.post(client.server_url + '/upload/image',
                    files={'image': (name, stream, mimetypes.guess_type(name)[0] or 'application/octet-stream')}, timeout=120)
            response.raise_for_status()
            uploaded = response.json()
            staged.append('/'.join(filter(None, [uploaded.get('subfolder'), uploaded['name']])))
        seed = spec['seed'] if spec['seed'] is not None else time.time_ns() % (2**53)
        graph = build_workflow(spec, staged, seed, 'beatdesign/ref2va/' + output.parent.name)
        write_json(output.with_suffix('.workflow.json'), graph)
        state = {'fingerprint': fingerprint, 'spec': spec, 'seed': seed, 'client_id': client.client_id,
                 'phase': 'submitting', 'server_url': client.server_url,
                 'workflowSha256': sha256(output.with_suffix('.workflow.json'))}
        write_json(state_path, state)
        prompt_id = client.submit(graph)
    state.update(prompt_id=prompt_id, phase='submitted')
    write_json(state_path, state)
    if not output.exists():
        client.generate(graph, output_node='15', dest=output, timeout=3600, interval=5, resume_prompt_id=prompt_id)
    history = requests.get(client.server_url + '/history/' + prompt_id, timeout=15)
    history.raise_for_status()
    write_json(output.with_suffix('.history.json'), history.json())
    timing = verify_h3_output(output, inputs.get('wmDuration'))
    media = probe_media(output)
    video = next(s for s in media['streams'] if s['codec_type'] == 'video')
    if (video['width'], video['height']) != (1024, 576) or not any(s['codec_type'] == 'audio' for s in media['streams']):
        raise ValueError('Ref2VA output must be 1024×576 with native audio')
    data = {'output': str(output), 'prompt_id': prompt_id, 'model': 'MiniMax H3 Ref2VA INT8 + Ref2V Turbo 4',
            'cloud': False, 'native_audio': True, 'width': 1024, 'height': 576, 'fps': 24,
            'timing': timing, 'sha256': sha256(output), 'inputFingerprint': fingerprint,
            'references': state['spec']['references'], 'seed': state['seed'], 'templateSha256': spec['templateSha256']}
    write_json(output.with_suffix('.provenance.json'), data)
    return ToolResult(success=True, data=data)
