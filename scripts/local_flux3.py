"""FLUX 3 Klein generation/editing on a separately configured ComfyUI >=0.41.

Reuses existing weights and the shared worker/GPU lease; no cloud fallback.
"""
import json
from pathlib import Path
import re
import subprocess
import time
from urllib.parse import urlparse

from local_ref2va import sha256, input_fingerprint, recover_submission

ROOT = Path(__file__).resolve().parents[1]
LIMITS = json.loads((ROOT / 'src/core/generation-providers/local-flux3.json').read_text())
RATIOS = LIMITS['ratios']
TEMPLATE = ROOT / 'scripts/workflows/local-flux3-klein.json'
PROMPTS = ROOT / 'scripts/workflows/local-flux3-prompts.json'


def describe_flux3_inputs(inputs):
    references = inputs.get('_localReferences', [])
    if not isinstance(references, list) or len(references) > LIMITS['maxReferenceImages']:
        raise ValueError('FLUX 3 accepts at most 10 image references')
    if inputs.get('_localReferencePaths', []) and not references:
        raise ValueError('FLUX 3 requires typed project references')
    described = []
    for index, ref in enumerate(references):
        if ref['type'] != 'image':
            raise ValueError('FLUX 3 accepts image references only')
        path = Path(ref['path']).resolve(strict=True)
        described.append({**ref, 'path': str(path), 'sha256': sha256(path),
                          'label': '@Image{}'.format(index + 1), 'modelLabel': '<ref_image_{}>'.format(index)})
    prompt = inputs['prompt']
    for match in re.finditer(r'@Image(\d+)\b|<ref_image_(\d+)>', prompt):
        index = int(match[1]) - 1 if match[1] is not None else int(match[2])
        if not 0 <= index < len(described):
            raise ValueError('FLUX prompt refers to an unattached image')
    # The upsampler sees images in this exact order. Use natural ordinals in
    # its request; model-specific zero-based tags stay in saved provenance.
    resolved = re.sub(r'@Image(\d+)\b', lambda m: 'reference image {}'.format(m[1]), prompt)
    resolved = re.sub(r'<ref_image_(\d+)>', lambda m: 'reference image {}'.format(int(m[1]) + 1), resolved)
    return {'prompt': prompt, 'resolvedPrompt': resolved, 'references': described,
            'aspect_ratio': inputs.get('aspect_ratio', '1:1'), 'seed': inputs.get('seed'),
            'templateSha256': sha256(TEMPLATE), 'promptInstructionsSha256': sha256(PROMPTS),
            'referencePreparation': 'rgb-png-max1024;upsampler-letterbox768-v1'}


def stage_flux3_reference(ref, directory, index, client):
    from lib.local_runtime import bootstrap
    ffmpeg = bootstrap()['ffmpeg']
    prepared = Path(directory) / ('reference-{}.png'.format(index))
    vision = Path(directory) / ('reference-{}-vision.png'.format(index))
    # Single still frame, orientation applied by FFmpeg, source aspect retained.
    # Only the upsampler uses square letterboxes to batch differing dimensions
    # without cropping. Diffusion conditioning receives the unpadded image.
    for target, scale in [(prepared, 'scale=1024:1024:force_original_aspect_ratio=decrease'),
                          (vision, 'scale=768:768:force_original_aspect_ratio=decrease,pad=768:768:(ow-iw)/2:(oh-ih)/2:color=white')]:
        subprocess.run([ffmpeg, '-v', 'error', '-nostdin', '-y', '-i', ref['path'],
                        '-frames:v', '1', '-vf', scale, '-pix_fmt', 'rgb24', str(target)],
                       check=True, capture_output=True, timeout=120)
    names = []
    for path in [prepared, vision]:
        name = 'beatdesign-flux3-{}.png'.format(sha256(path)[:32])
        uploaded = client.upload_image(path, name=name)
        names.append(uploaded)
    ref.update(preparedSha256=sha256(prepared), visionSha256=sha256(vision))
    return names


def release_flux3(config):
    import requests
    if not config:
        return
    url = config['url'].rstrip('/')
    try:
        queue = requests.get(url + '/queue', timeout=10)
    except requests.ConnectionError:
        return
    queue.raise_for_status()
    if queue.json().get('queue_running') or queue.json().get('queue_pending'):
        raise RuntimeError('FLUX ComfyUI has existing work; cannot switch the shared GPU')
    requests.post(url + '/free', json={'unload_models': True, 'free_memory': True}, timeout=15).raise_for_status()
    for _ in range(30):
        stats = requests.get(url + '/system_stats', timeout=10)
        stats.raise_for_status()
        devices = stats.json().get('devices', [])
        if devices and all(d.get('torch_vram_total', 0) - d.get('torch_vram_free', 0) < 256 * 1024**2 for d in devices):
            return
        time.sleep(1)
    raise RuntimeError('FLUX model memory release was not confirmed; shared GPU switch stopped')


def ensure_flux3(config, notify):
    import requests
    if not config or urlparse(config.get('url', '')).hostname not in ('127.0.0.1', 'localhost', '::1'):
        raise ValueError('Configure a loopback flux3 runtime in local-runtime.json; see docs/LOCAL_MODELS.md')
    url = config['url'].rstrip('/')
    try:
        ready = requests.get(url + '/system_stats', timeout=2).ok
    except requests.ConnectionError:
        ready = False
    if not ready:
        base = Path(config['dataDir']).resolve()
        base.mkdir(parents=True, exist_ok=True)
        parsed = urlparse(url)
        command = [config['python'], '-X', 'utf8', str(Path(config['root']) / 'main.py'),
                   '--base-directory', str(base), '--models-directory', config['modelDir'],
                   '--listen', parsed.hostname, '--port', str(parsed.port), '--disable-auto-launch',
                   '--disable-all-custom-nodes', '--preview-method', 'none', '--use-pytorch-cross-attention']
        with (base / 'stdout.log').open('ab') as out, (base / 'stderr.log').open('ab') as err:
            import os
            proc = subprocess.Popen(command, cwd=config['root'], stdout=out, stderr=err,
                                    stdin=subprocess.DEVNULL, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        for _ in range(60):
            if proc.poll() is not None:
                raise RuntimeError('FLUX ComfyUI exited; inspect its runtime logs')
            try:
                if requests.get(url + '/system_stats', timeout=2).ok:
                    break
            except requests.ConnectionError:
                pass
            notify('Starting the isolated FLUX 3 runtime')
            time.sleep(2)
        else:
            raise RuntimeError('FLUX ComfyUI startup timed out')
    info = requests.get(url + '/object_info/CLIPLoader', timeout=15)
    info.raise_for_status()
    if 'flux3' not in info.json()['CLIPLoader']['input']['required']['type'][0]:
        raise ValueError('FLUX 3 requires ComfyUI >=0.41 with the flux3 CLIP type')
    return url


def build_flux3_workflow(inputs, seed, prefix, staged=()):
    width, height = RATIOS[inputs.get('aspect_ratio', '1:1')]
    graph = json.loads(TEMPLATE.read_text(encoding='utf8'))
    graph['6']['inputs'].update(width=width, height=height)
    graph['7']['inputs']['seed'] = seed
    graph['11']['inputs']['prompt'] = 'TARGET CANVAS: {}:{}\n{}'.format(width, height, inputs.get('resolvedPrompt', inputs['prompt']))
    prompts = json.loads(PROMPTS.read_text(encoding='utf8'))
    graph['11']['inputs']['system_prompt'] = prompts['i2i' if staged else 't2i']
    if staged:
        # Native ComfyUI edit conditioning on BOTH branches, as in the official
        # editing template. Keep the independently selected output canvas size.
        graph['12'] = {'class_type': 'ConditioningZeroOut', 'inputs': {'conditioning': ['4', 0]}}
        graph['13'] = {'class_type': 'ReferenceMultiLatent', 'inputs': {
            'positive': ['4', 0], 'negative': ['12', 0], 'vae': ['3', 0],
            'resolution': 'resize', 'resolution.megapixels': 1.0}}
        graph['14'] = {'class_type': 'BatchImagesNode', 'inputs': {}}
        for index, (image, vision) in enumerate(staged):
            node, vision_node = str(100 + index * 2), str(101 + index * 2)
            graph[node] = {'class_type': 'LoadImage', 'inputs': {'image': image}}
            graph[vision_node] = {'class_type': 'LoadImage', 'inputs': {'image': vision}}
            graph['13']['inputs']['images.image{}'.format(index)] = [node, 0]
            graph['14']['inputs']['images.image{}'.format(index)] = [vision_node, 0]
        graph['11']['inputs']['image'] = ['14', 0]
        graph['7']['inputs'].update(positive=['13', 0], negative=['13', 1])
    graph['9']['inputs']['filename_prefix'] = prefix
    return graph


def execute_flux3(inputs, output, url):
    import requests
    from lib.local_runtime import probe_media, write_json
    from tools._comfyui.client import ComfyUIClient
    from tools.base_tool import ToolResult
    spec = describe_flux3_inputs(inputs)
    fingerprint = input_fingerprint(spec)
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    receipt = output.with_suffix('.flux3.json')
    state = json.loads(receipt.read_text(encoding='utf8')) if receipt.exists() else None
    if state and (state['fingerprint'] != fingerprint or state['server_url'] != url):
        raise ValueError('FLUX inputs/runtime changed; refusing to recover a different take')
    if state and sha256(output.with_suffix('.workflow.json')) != state.get('workflowSha256'):
        raise ValueError('Saved FLUX workflow changed; refusing to resume')
    client = ComfyUIClient(server_url=url)
    if output.exists() and output.with_suffix('.provenance.json').exists():
        data = json.loads(output.with_suffix('.provenance.json').read_text(encoding='utf8'))
        if not state or data['inputFingerprint'] != fingerprint or data['sha256'] != sha256(output):
            raise ValueError('Recovered FLUX output does not match its provenance')
        return ToolResult(success=True, data=data)
    if state:
        prompt_id = recover_submission(client, state)
        graph = json.loads(output.with_suffix('.workflow.json').read_text(encoding='utf8'))
    else:
        if output.exists():
            raise ValueError('Refusing to overwrite an untracked FLUX output')
        queue = requests.get(url + '/queue', timeout=10)
        queue.raise_for_status()
        if queue.json().get('queue_running') or queue.json().get('queue_pending'):
            raise RuntimeError('FLUX ComfyUI has existing work; leave it untouched')
        seed = spec['seed'] if spec['seed'] is not None else time.time_ns() % (2**53)
        staged = [stage_flux3_reference(ref, output.parent, index, client)
                  for index, ref in enumerate(spec['references'])]
        graph = build_flux3_workflow(spec, seed, 'beatdesign/flux3/' + output.parent.name, staged)
        write_json(output.with_suffix('.workflow.json'), graph)
        state = {'fingerprint': fingerprint, 'spec': spec, 'seed': seed, 'client_id': client.client_id,
                 'server_url': url, 'phase': 'submitting', 'workflowSha256': sha256(output.with_suffix('.workflow.json'))}
        write_json(receipt, state)
        prompt_id = client.submit(graph)
    state.update(prompt_id=prompt_id, phase='submitted')
    write_json(receipt, state)
    if not output.exists():
        client.generate(graph, output_node='9', dest=output, timeout=1800, interval=5, resume_prompt_id=prompt_id)
    history = requests.get(url + '/history/' + prompt_id, timeout=15)
    history.raise_for_status()
    write_json(output.with_suffix('.history.json'), history.json())
    stream = probe_media(output)['streams'][0]
    width, height = RATIOS[spec['aspect_ratio']]
    if (stream['width'], stream['height']) != (width, height):
        raise ValueError('FLUX output dimensions do not match the selected aspect ratio')
    data = {'output': str(output), 'prompt_id': prompt_id, 'model': 'FLUX 3 Image Klein BF16 distilled',
            'steps': 16, 'promptUpsampler': 'Qwen3.5 9B INT8', 'width': width, 'height': height,
            'cloud': False, 'sha256': sha256(output), 'inputFingerprint': fingerprint,
            'seed': state['seed'], 'templateSha256': spec['templateSha256'],
            'promptInstructionsSha256': spec['promptInstructionsSha256'],
            'references': state['spec']['references'],
            'mode': 'image-edit' if spec['references'] else 'text-to-image'}
    write_json(output.with_suffix('.provenance.json'), data)
    return ToolResult(success=True, data=data)
