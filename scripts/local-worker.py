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
from contextlib import ExitStack
from local_worker_schedule import WorkerPolicy, next_group, run_group


def _run(resources):
    parser = argparse.ArgumentParser()
    parser.add_argument('--jobs', required=True)
    parser.add_argument('--runtime', required=True)
    parser.add_argument('--settings')
    args = parser.parse_args()
    root = Path(args.jobs).resolve()
    root.mkdir(parents=True, exist_ok=True)
    import msvcrt
    lock = resources.enter_context((root / 'worker.lock').open('a+b'))
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
    from local_ref2va import execute_ref2va
    from local_flux3 import ensure_flux3, execute_flux3, release_flux3
    from local_narration import execute_narration
    settings = json.loads(Path(args.settings).read_text(encoding='utf8')) if args.settings else {}
    flux_config = settings.get('flux3')
    policy = WorkerPolicy.from_settings(settings)

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
        lease = 'h3' if model in ('local-h3', 'local-h3-ref2va') else 'flux3' if model == 'local-flux3-klein' else 'drama3'
        try:
            with gpu_batch(lease):
                flux_url = None
                prepared = False
                preparation_seconds = 0
                def prepare(notify):
                    nonlocal flux_url, prepared, preparation_seconds
                    if prepared:
                        return
                    began = time.monotonic()
                    if lease == 'flux3':
                        stop_owned_drama()
                        release_flux3(flux_config)
                        if _ready(bootstrap()['comfyui_url'] + '/system_stats'):
                            release_comfy()
                        flux_url = ensure_flux3(flux_config, notify)
                    elif lease == 'h3':
                        release_flux3(flux_config)
                        stop_owned_drama()
                        ensure_comfy(notify)
                    else:
                        release_flux3(flux_config)
                        cfg = bootstrap()
                        # Driver-wide free VRAM includes a resident Drama model.
                        # Only require H3's cold-switch threshold before loading TTS.
                        if not _ready(cfg['drama3_url'] + '/health') and _ready(cfg['comfyui_url'] + '/system_stats'):
                            release_comfy()
                        ensure_drama(notify)
                    preparation_seconds = time.monotonic() - began
                    prepared = True

                while True:
                    def resident_idle():
                        write_json(root / 'worker-status.json', {'state': 'resident_idle', 'model': model,
                                   'idle_seconds': policy.idle_seconds, 'pid': os.getpid()})
                    group = next_group(model, pending, policy.idle_seconds if prepared else 0, resident_idle)
                    if not group:
                        break
                    selected = group[:policy.tts_concurrency if lease == 'drama3' else 1]
                    was_prepared = prepared
                    owner_path, owner_job = selected[0]
                    def preparing(message):
                        owner_job.update(message=message, phase='model_preparation')
                        write_json(owner_path, owner_job)
                    try:
                        prepare(preparing)
                    except Exception as exc:
                        for path, job in selected:
                            job.update(status='failed', phase='preparation_failed', error=str(exc),
                                       inference_started=False, completedAt=time.time(), traceback=traceback.format_exc())
                            write_json(path, job)
                        continue

                    def execute_one(item):
                        path, job = item
                        job.update(status='processing', startedAt=job.get('startedAt', time.time()))
                        job['phase'] = 'inference'
                        job['inference_started'] = False
                        job['timings'] = {'queue_wait_seconds': max(0, time.time() - job['createdAt'] / 1000),
                                          'preparation_seconds': preparation_seconds if path == owner_path and not was_prepared else 0,
                                          'model_reused': was_prepared, 'batch_size': len(selected)}
                        write_json(path, job)
                        began = time.monotonic()
                        try:
                            output = path.parent / ('output.mp4' if lease == 'h3' else 'output.png' if lease == 'flux3' else 'output.wav')
                            if output.exists() and model != 'local-h3-ref2va':
                                probe_media(output)
                                provenance = json.loads(output.with_suffix('.provenance.json').read_text(encoding='utf8'))
                                if lease == 'h3':
                                    provenance['timing'] = verify_h3_output(output, job['input'].get('wmDuration'))
                            else:
                                job['inference_started'] = True
                                write_json(path, job)
                                if lease == 'flux3':
                                    result = execute_flux3(job['input'], output, flux_url)
                                elif model == 'local-h3-ref2va':
                                    result = execute_ref2va(job['input'], output)
                                elif lease == 'h3':
                                    result = execute_h3_with_duration(job['input'], output)
                                else:
                                    result = execute_narration(job['input'], output)
                                if not result.success:
                                    raise RuntimeError(result.error)
                                provenance = result.data
                            job['timings']['execution_seconds'] = time.monotonic() - began
                            provenance['worker_timing'] = dict(job['timings'])
                            job.update(status='succeeded', phase='completed', provenance=provenance, completedAt=time.time())
                        except Exception as exc:
                            job.update(status='failed', phase='failed', error=str(exc), traceback=traceback.format_exc())
                        write_json(path, job)
                    run_group(selected, execute_one, policy.tts_concurrency if lease == 'drama3' else 1)
                if lease == 'h3':
                    release_comfy()
                elif lease == 'flux3':
                    release_flux3(flux_config)
                else:
                    stop_owned_drama()
        except RuntimeError as exc:
            # Another integration owns the GPU: keep queued jobs, retry later.
            (root / 'worker-status.json').write_text(json.dumps({'waiting': str(exc)}), encoding='utf8')
            time.sleep(5)


def main():
    with ExitStack() as resources:
        _run(resources)


if __name__ == '__main__':
    main()
