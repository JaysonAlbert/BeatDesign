"""Durable single-GPU queue using the existing, configured OpenMontage adapters.

No models or project state are copied. A process lock prevents duplicate workers;
the existing runtime's GPU lease also excludes its OpenMontage control surface.
"""
import argparse
import json
import os
from pathlib import Path
import sys
import time
import traceback


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--jobs', required=True)
    parser.add_argument('--runtime', required=True)
    args = parser.parse_args()
    root = Path(args.jobs).resolve()
    root.mkdir(parents=True, exist_ok=True)
    import msvcrt
    lock = (root / 'worker.lock').open('a+b')
    if lock.seek(0, 2) == 0:
        lock.write(b'0'); lock.flush()
    lock.seek(0)
    try:
        msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
    except OSError:
        return
    sys.path.insert(0, str(Path(args.runtime).resolve()))
    from lib.local_runtime import gpu_batch, write_json, probe_media, bootstrap
    from lib.local_services import ensure_comfy, ensure_drama, release_comfy, stop_owned_drama, _ready
    from local_h3_duration import execute_h3_with_duration, verify_h3_output
    from tools.audio.drama3_local_tts import Drama3LocalTTS

    def pending():
        jobs = []
        for path in root.glob('*/job.json'):
            job = json.loads(path.read_text(encoding='utf8'))
            if job['status'] in ('pending', 'processing'):
                jobs.append((path, job))
        return sorted(jobs, key=lambda item: item[1]['createdAt'])

    # A recovered TTS HTTP request has no resumable server id. Never silently
    # repeat it after a crash; retain its failed job for an explicit new attempt.
    for path, job in pending():
        if job['status'] == 'processing' and job['model'] == 'local-drama3':
            job.update(status='failed', error='Worker interrupted during TTS. Inspect the take, then submit a new attempt.')
            write_json(path, job)
    while pending():
        model = pending()[0][1]['model']
        lease = 'h3' if model == 'local-h3' else 'drama3'
        try:
            with gpu_batch(lease):
                while True:
                    group = [item for item in pending() if item[1]['model'] == model]
                    if not group:
                        break
                    path, job = group[0]
                    def notify(message):
                        job['message'] = message
                        write_json(path, job)
                    try:
                        job.update(status='processing', startedAt=job.get('startedAt', time.time()))
                        write_json(path, job)
                        output = path.parent / ('output.mp4' if lease == 'h3' else 'output.wav')
                        if output.exists():
                            probe_media(output)
                            provenance = json.loads(output.with_suffix('.provenance.json').read_text(encoding='utf8'))
                            if lease == 'h3':
                                provenance['timing'] = verify_h3_output(output, job['input'].get('wmDuration'))
                        else:
                            inputs = job['input']
                            if lease == 'h3':
                                stop_owned_drama()
                                ensure_comfy(notify)
                                result = execute_h3_with_duration(inputs, output)
                            else:
                                if _ready(bootstrap()['comfyui_url'] + '/system_stats'):
                                    release_comfy()
                                ensure_drama(notify)
                                result = Drama3LocalTTS().execute({'text': inputs['prompt'], 'output_path': str(output)})
                            if not result.success:
                                raise RuntimeError(result.error)
                            provenance = result.data
                        job.update(status='succeeded', provenance=provenance, completedAt=time.time())
                    except Exception as exc:
                        job.update(status='failed', error=str(exc), traceback=traceback.format_exc())
                    write_json(path, job)
                if lease == 'h3':
                    release_comfy()
                else:
                    stop_owned_drama()
        except RuntimeError as exc:
            # Another integration owns the GPU: keep queued jobs, retry later.
            (root / 'worker-status.json').write_text(json.dumps({'waiting': str(exc)}), encoding='utf8')
            time.sleep(5)


if __name__ == '__main__':
    main()
