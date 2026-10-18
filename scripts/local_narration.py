"""Local Drama adapter called only by the normal BeatDesign job worker.

References are typed project Assets resolved by shared server preflight, never
client-supplied paths. Reuses the runtime's existing service and GPU lease.
"""
import hashlib
import json
from pathlib import Path, PureWindowsPath
import time
from urllib.parse import urlparse


def server_audio_path(path):
    """The configured Drama service runs in WSL on the same workstation."""
    win = PureWindowsPath(str(path))
    if win.drive:
        if len(win.drive) != 2 or win.drive[1] != ':':
            raise ValueError('Drama reference must be on a WSL-mounted local drive, not UNC')
        return '/mnt/' + win.drive[0].lower() + '/' + '/'.join(win.parts[1:])
    return str(Path(path).resolve())


def describe_narration(inputs, probe):
    text = inputs.get('prompt')
    if not isinstance(text, str) or not text.strip() or len(text) > 200:
        raise ValueError('Narration requires 1-200 characters')
    payload = {'input': text, 'response_format': 'wav', 'stream': False,
               'max_new_tokens': inputs.get('max_new_tokens', 512),
               'temperature': inputs.get('temperature', 0.8), 'top_p': inputs.get('top_p', 0.9)}
    refs = inputs.get('_localReferences', [])
    ref_text = inputs.get('reference_text')
    if bool(refs) != bool(ref_text) or len(refs) > 1:
        raise ValueError('One reference audio Asset and exact reference text must be supplied together')
    references = []
    if refs:
        ref = refs[0]
        if ref.get('type') != 'audio' or not ref.get('assetId'):
            raise ValueError('Narration reference must be a resolved audio Asset')
        path = Path(ref['path']).resolve(strict=True)
        media = probe(path)
        if not any(s['codec_type'] == 'audio' for s in media['streams']):
            raise ValueError('Reference has no decodable audio')
        duration = float(media['format']['duration'])
        if not 0 < duration <= 30:
            raise ValueError('Reference voice must be greater than zero and at most 30 seconds')
        payload['references'] = [{'audio_path': server_audio_path(path), 'text': ref_text}]
        references.append({'assetId': ref['assetId'], 'path': str(path), 'text': ref_text,
                           'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'duration_seconds': duration})
    fingerprint = hashlib.sha256(json.dumps({'request': payload, 'references': references}, sort_keys=True).encode()).hexdigest()
    return payload, references, fingerprint


def execute_narration(inputs, output):
    import requests
    from lib.local_runtime import bootstrap, probe_media, write_json
    from tools.base_tool import ToolResult
    started = time.monotonic()
    try:
        cfg = bootstrap()
        base = cfg['drama3_url'].rstrip('/')
        if urlparse(base).hostname not in {'localhost', '127.0.0.1', '::1'}:
            raise ValueError('The configured Drama worker must be local')
        output = Path(output).resolve()
        if output.exists() or output.with_suffix('.request.json').exists():
            raise FileExistsError('Ambiguous/previous narration attempt exists; inspect before creating a new take')
        payload, references, fingerprint = describe_narration(inputs, probe_media)
        models = requests.get(base + '/v1/models', timeout=10)
        models.raise_for_status()
        model_info = models.json()
        if not any('drama-3-int4' in m.get('id', '') for m in model_info.get('data', [])):
            raise RuntimeError('Configured service does not report Drama 3 INT4')
        output.parent.mkdir(parents=True, exist_ok=True)
        write_json(output.with_suffix('.request.json'), {'request': payload, 'references': references, 'input_fingerprint': fingerprint})
        response = requests.post(base + '/v1/audio/speech', json=payload, timeout=(10, 900))
        if not response.ok:
            raise RuntimeError(f'Drama HTTP {response.status_code}: {response.text[:1000]}')
        if response.content[:4] != b'RIFF':
            raise RuntimeError('Drama did not return WAV audio')
        output.write_bytes(response.content)
        media = probe_media(output)
        audio = next(s for s in media['streams'] if s['codec_type'] == 'audio')
        provenance = {'provider': 'drama3_local', 'model': cfg['drama3_model'], 'output': str(output),
            'text': payload['input'], 'audio_duration_seconds': float(media['format']['duration']),
            'sample_rate': int(audio['sample_rate']), 'channels': audio['channels'],
            'sha256': hashlib.sha256(response.content).hexdigest(), 'references': references,
            'input_fingerprint': fingerprint, 'voice_mode': 'fixed_reference' if references else 'unconditional',
            'parameters': {k: v for k, v in payload.items() if k not in ('references', 'input')},
            'endpoint_models': model_info, 'human_listening_accepted': False}
        write_json(output.with_suffix('.provenance.json'), provenance)
        return ToolResult(success=True, data=provenance, artifacts=[str(output)],
                          model=cfg['drama3_model'], duration_seconds=time.monotonic()-started)
    except Exception as exc:
        return ToolResult(success=False, error=str(exc), duration_seconds=time.monotonic()-started)
