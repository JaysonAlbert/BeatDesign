"""FLUX 3 Klein text-to-image on a separately configured ComfyUI >=0.41.

Reuses existing weights and the shared worker/GPU lease; no cloud fallback.
"""
import json
from pathlib import Path
import subprocess
import time
from urllib.parse import urlparse

from local_ref2va import sha256, input_fingerprint, recover_submission

ROOT = Path(__file__).resolve().parents[1]
RATIOS = json.loads((ROOT / 'src/core/generation-providers/local-flux3.json').read_text())['ratios']
TEMPLATE = ROOT / 'scripts/workflows/local-flux3-klein.json'


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


def build_flux3_workflow(inputs, seed, prefix):
    width, height = RATIOS[inputs.get('aspect_ratio', '1:1')]
    graph = json.loads(TEMPLATE.read_text(encoding='utf8'))
    graph['6']['inputs'].update(width=width, height=height)
    graph['7']['inputs']['seed'] = seed
    graph['11']['inputs']['prompt'] = 'TARGET CANVAS: {}:{}\n{}'.format(width, height, inputs['prompt'])
    graph['9']['inputs']['filename_prefix'] = prefix
    return graph


def execute_flux3(inputs, output, url):
    import requests
    from lib.local_runtime import probe_media, write_json
    from tools._comfyui.client import ComfyUIClient
    from tools.base_tool import ToolResult
    spec = {'prompt': inputs['prompt'], 'aspect_ratio': inputs.get('aspect_ratio', '1:1'),
            'seed': inputs.get('seed'), 'templateSha256': sha256(TEMPLATE)}
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
        graph = build_flux3_workflow(inputs, seed, 'beatdesign/flux3/' + output.parent.name)
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
            'seed': state['seed'], 'templateSha256': spec['templateSha256']}
    write_json(output.with_suffix('.provenance.json'), data)
    return ToolResult(success=True, data=data)
