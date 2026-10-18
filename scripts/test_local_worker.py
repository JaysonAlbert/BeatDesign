"""Model-free scheduler and real worker-loop regression tests."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import threading
import time
from contextlib import contextmanager
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
import local_worker_schedule as schedule


class PolicyTests(unittest.TestCase):
    def test_invalid_settings_are_rejected(self):
        for value in [{'idleSeconds':-1},{'idleSeconds':float('nan')},{'ttsConcurrency':True},{'ttsConcurrency':5}]:
            with self.assertRaises(ValueError):schedule.WorkerPolicy.from_settings({'worker':value})

    def test_different_model_preempts_idle_grace(self):
        sleeps=[]
        self.assertEqual(schedule.next_group('a',lambda:[('p',{'model':'b'})],120,sleep=sleeps.append),[])
        self.assertEqual(sleeps,[])

    def test_parallel_group_is_bounded_and_completes_every_item(self):
        active=maximum=0;done=[];lock=threading.Lock()
        def execute(item):
            nonlocal active,maximum
            with lock:active+=1;maximum=max(active,maximum)
            time.sleep(.02)
            with lock:active-=1;done.append(item)
        schedule.run_group(range(5),execute,2)
        self.assertEqual(sorted(done),list(range(5)));self.assertEqual(maximum,2)


class WorkerLoopTests(unittest.TestCase):
    def run_worker(self, count=2, late=False, interrupted=False, concurrency=1, fail_first=False):
        with tempfile.TemporaryDirectory() as name:
            root=Path(name);jobs=root/'jobs';jobs.mkdir();settings=root/'settings.json'
            settings.write_text(json.dumps({'worker':{'idleSeconds':1,'ttsConcurrency':concurrency}}))
            def create(index,status='pending'):
                folder=jobs/str(index);folder.mkdir();(folder/'job.json').write_text(json.dumps({'id':str(index),'status':status,'model':'local-drama3','input':{'fail':fail_first and index==1},'createdAt':time.time()*1000}))
            create(1,'processing' if interrupted else 'pending')
            if count==2 and not late:create(2)
            state={'resident':False,'ensure':0,'releases':0,'executed':0,'leases':0,'clock':0,'injected':False}
            @contextmanager
            def lease(_):state['leases']+=1;yield
            def write(path,value):path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(value))
            def ensure(_):state['ensure']+=1;state['resident']=True
            def release():
                if state['resident']:raise RuntimeError('Cannot count Drama VRAM as H3 residue')
                state['releases']+=1
            def stop():state['resident']=False
            def ready(url):return state['resident'] if '/health' in url else True
            def execute(inputs,output):state['executed']+=1;output.write_bytes(b'fake');return SimpleNamespace(success=not inputs.get('fail'),data={},error='Deliberate failed take' if inputs.get('fail') else None)
            def sleep(seconds):
                state['clock']+=seconds
                if late and not state['injected']:create(2);state['injected']=True
            original=schedule.next_group
            def next_group(model,pending,idle,on_idle):return original(model,pending,idle,on_idle,clock=lambda:state['clock'],sleep=sleep)
            def module(name,**values):m=ModuleType(name);m.__dict__.update(values);return m
            modules={
                'lib':module('lib'),
                'lib.local_runtime':module('lib.local_runtime',gpu_batch=lease,write_json=write,probe_media=lambda p:None,bootstrap=lambda:{'comfyui_url':'http://comfy','drama3_url':'http://drama'}),
                'lib.local_services':module('lib.local_services',ensure_comfy=lambda _:None,ensure_drama=ensure,release_comfy=release,stop_owned_drama=stop,_ready=ready),
                'local_h3_duration':module('local_h3_duration',execute_h3_with_duration=execute,verify_h3_output=lambda *_:{}),
                'local_ref2va':module('local_ref2va',execute_ref2va=execute),
                'local_flux3':module('local_flux3',ensure_flux3=lambda *_:None,execute_flux3=execute,release_flux3=lambda _:None),
                'local_narration':module('local_narration',execute_narration=execute),
            }
            spec=importlib.util.spec_from_file_location('tested_worker',Path(__file__).with_name('local-worker.py'));worker=importlib.util.module_from_spec(spec)
            with patch.object(schedule,'next_group',next_group),patch.dict(sys.modules,modules),patch.object(sys,'argv',['worker','--jobs',str(jobs),'--runtime',str(root),'--settings',str(settings)]),patch.object(sys,'path',sys.path[:]):
                spec.loader.exec_module(worker);worker.main()
            rows=[json.loads(p.read_text()) for p in sorted(jobs.glob('*/job.json'))]
            return state,rows

    def test_two_tts_jobs_share_one_preparation_and_cold_release(self):
        state,rows=self.run_worker()
        self.assertEqual([r['status'] for r in rows],['succeeded','succeeded'])
        self.assertEqual((state['ensure'],state['releases'],state['executed']),(1,1,2))
        self.assertFalse(rows[0]['timings']['model_reused']);self.assertTrue(rows[1]['timings']['model_reused'])

    def test_late_client_submission_keeps_model_and_same_gpu_lease(self):
        state,rows=self.run_worker(late=True)
        self.assertEqual(len(rows),2);self.assertTrue(all(r['status']=='succeeded' for r in rows))
        self.assertEqual((state['ensure'],state['leases']),(1,1))

    def test_interrupted_tts_is_never_resubmitted(self):
        state,rows=self.run_worker(count=1,interrupted=True)
        self.assertEqual(rows[0]['status'],'failed');self.assertEqual(state['executed'],0)

    def test_parallel_tts_persists_each_result_and_failure_independently(self):
        state,rows=self.run_worker(concurrency=2,fail_first=True)
        self.assertEqual([r['status'] for r in rows],['failed','succeeded'])
        self.assertEqual(state['ensure'],1);self.assertEqual(rows[1]['timings']['batch_size'],2)


if __name__=='__main__':unittest.main()
