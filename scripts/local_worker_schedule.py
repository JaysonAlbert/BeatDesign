"""Small scheduling policy; no model imports, network, or process control."""
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
import math
import time


@dataclass(frozen=True)
class WorkerPolicy:
    idle_seconds: float = 120
    tts_concurrency: int = 1

    @classmethod
    def from_settings(cls, settings):
        value = settings.get('worker', {})
        if not isinstance(value, dict):
            raise ValueError('worker settings must be an object')
        idle = value.get('idleSeconds', 120)
        parallel = value.get('ttsConcurrency', 1)
        if type(idle) not in (int, float) or not math.isfinite(idle) or not 0 <= idle <= 600:
            raise ValueError('worker.idleSeconds must be between 0 and 600')
        if type(parallel) is not int or not 1 <= parallel <= 4:
            raise ValueError('worker.ttsConcurrency must be an integer between 1 and 4')
        return cls(idle, parallel)


def next_group(model, pending, idle_seconds, on_idle=lambda: None,
               clock=time.monotonic, sleep=time.sleep):
    """Keep one loaded model briefly; a different queued model wins immediately."""
    deadline = clock() + idle_seconds
    announced = False
    while True:
        rows = pending()
        same = [row for row in rows if row[1]['model'] == model]
        if same:
            return same
        if rows or clock() >= deadline:
            return []
        if not announced:
            on_idle()
            announced = True
        sleep(max(0, min(.5, deadline - clock())))


def run_group(items, execute, concurrency):
    if concurrency == 1:
        for item in items:
            execute(item)
    else:
        with ThreadPoolExecutor(max_workers=concurrency) as pool:
            # Completion, persistence and errors belong to each individual job.
            list(pool.map(execute, items))
