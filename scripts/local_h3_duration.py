"""Job-local duration override for the pinned external H3 adapter.

Keep the shared runtime/template unchanged. The external adapter still owns
submission, GPU leasing, recovery, media probing and provenance.
"""
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path

CATALOG = json.loads((Path(__file__).resolve().parents[1] /
    'src/core/generation-providers/local-h3-durations.json').read_text(encoding='utf8'))


def resolve_timing(duration=None):
    duration = CATALOG['defaultDuration'] if duration is None else duration
    for preset in CATALOG['presets']:
        if preset['duration'] == duration:
            return {**preset, 'fps': CATALOG['fps'],
                    'duration_seconds': preset['frames'] / CATALOG['fps']}
    raise ValueError('Unsupported local H3 duration; choose a catalog preset.')


def prepare_duration_config(config, duration, directory):
    timing = resolve_timing(duration)
    template_bytes = Path(config['h3_workflow']).read_bytes()
    if hashlib.sha256(template_bytes).hexdigest() != config['h3_workflow_sha256']:
        raise ValueError('Pinned H3 workflow changed; review it before generating')
    workflow = json.loads(template_bytes)
    # Fail closed if the independently maintained runtime changes topology.
    i2v = workflow.get('6', {})
    video = workflow.get('14', {})
    if (i2v.get('class_type') != 'MiniMaxH3ImageToVideo' or
        i2v.get('inputs', {}).get('length') != 158 or
        i2v['inputs'].get('width') != 1024 or i2v['inputs'].get('height') != 576 or
        video.get('class_type') != 'CreateVideo' or
        video.get('inputs', {}).get('fps') != CATALOG['fps']):
        raise ValueError('Pinned H3 duration mapping is stale; review the workflow')
    workflow['6']['inputs']['length'] = timing['frames']
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    template_path = directory / 'h3-template.json'
    encoded = json.dumps(workflow, ensure_ascii=False, indent=2).encode('utf8')
    template_path.write_bytes(encoded)
    derived = {**config, 'h3_workflow': str(template_path.resolve()),
               'h3_workflow_sha256': hashlib.sha256(encoded).hexdigest()}
    config_path = directory / 'h3-runtime.json'
    config_path.write_text(json.dumps(derived, ensure_ascii=False, indent=2), encoding='utf8')
    (directory / 'h3-timing.json').write_text(json.dumps(timing, indent=2), encoding='utf8')
    return config_path


@contextmanager
def configured_h3_duration(duration, directory):
    from lib.local_runtime import bootstrap
    config_path = prepare_duration_config(bootstrap(), duration, directory)
    previous = os.environ.get('OPENMONTAGE_LOCAL_CONFIG')
    os.environ['OPENMONTAGE_LOCAL_CONFIG'] = str(config_path.resolve())
    try:
        yield resolve_timing(duration)
    finally:
        if previous is None:
            os.environ.pop('OPENMONTAGE_LOCAL_CONFIG', None)
        else:
            os.environ['OPENMONTAGE_LOCAL_CONFIG'] = previous


def verify_h3_output(output, duration=None):
    from lib.local_runtime import probe_media
    timing = resolve_timing(duration)
    media = probe_media(Path(output))
    video = next(stream for stream in media['streams'] if stream['codec_type'] == 'video')
    rate_a, rate_b = map(int, video['avg_frame_rate'].split('/'))
    if int(video.get('nb_frames', 0)) != timing['frames'] or rate_a != timing['fps'] * rate_b:
        raise ValueError('Local H3 output timing differs from the requested preset')
    return timing


def execute_h3_with_duration(inputs, output):
    from lib.local_runtime import write_json
    from tools.video.local_h3_video import LocalH3Video
    output = Path(output)
    with configured_h3_duration(inputs.get('wmDuration'), output.parent) as timing:
        saved_workflow = output.with_suffix('.workflow.json')
        if saved_workflow.exists():
            saved = json.loads(saved_workflow.read_text(encoding='utf8'))
            if saved.get('6', {}).get('inputs', {}).get('length') != timing['frames']:
                raise ValueError('Recovered H3 job has a different duration; refusing to resume')
        result = LocalH3Video().execute({'prompt': inputs['prompt'],
            'reference_image_path': inputs['_localReferencePaths'][0],
            'output_path': str(output),
            **({'seed': inputs['seed']} if 'seed' in inputs else {})})
        if result.success:
            result.data['timing'] = verify_h3_output(output, timing['duration'])
            write_json(output.with_suffix('.provenance.json'), result.data)
        return result
