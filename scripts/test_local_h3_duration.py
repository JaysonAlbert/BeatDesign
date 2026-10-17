import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from local_h3_duration import CATALOG, execute_h3_with_duration, prepare_duration_config, resolve_timing


class DurationTests(unittest.TestCase):
    def test_native_grid(self):
        self.assertEqual(len(CATALOG['presets']), 15)
        for preset, frames in zip(CATALOG['presets'], range(124, 363, 17)):
            timing = resolve_timing(preset['duration'])
            self.assertEqual(timing['frames'], frames)
            self.assertEqual(timing['fps'], 24)
            self.assertAlmostEqual(float(preset['duration'][:-1]), frames / 24, delta=.000501)
        self.assertEqual(resolve_timing()['frames'], 158)

    def test_invalid_values(self):
        for value in ['4s', '5s', '10s', '16s', '', 15, False]:
            with self.assertRaises(ValueError):
                resolve_timing(value)

    def fixture(self, directory):
        workflow = {'6': {'class_type': 'MiniMaxH3ImageToVideo', 'inputs': {
            'length': 158, 'width': 1024, 'height': 576, 'first_frame': ['5', 0]}},
            '14': {'class_type': 'CreateVideo', 'inputs': {'fps': 24}}}
        path = Path(directory) / 'original.json'
        data = json.dumps(workflow).encode('utf8')
        path.write_bytes(data)
        return {'h3_workflow': str(path), 'h3_workflow_sha256': hashlib.sha256(data).hexdigest()}, data

    def test_only_length_changes_and_shared_template_is_unchanged(self):
        with tempfile.TemporaryDirectory() as directory:
            config, original = self.fixture(directory)
            for duration in ['5.167s', '15.083s']:
                path = prepare_duration_config(config, duration, Path(directory) / duration)
                derived = json.loads(path.read_text())
                data = Path(derived['h3_workflow']).read_bytes()
                workflow = json.loads(data)
                self.assertEqual(workflow['6']['inputs']['length'], resolve_timing(duration)['frames'])
                workflow['6']['inputs']['length'] = 158
                self.assertEqual(workflow, json.loads(original))
                self.assertEqual(hashlib.sha256(data).hexdigest(), derived['h3_workflow_sha256'])
            self.assertEqual(Path(config['h3_workflow']).read_bytes(), original)

    def test_stale_hash_and_topology_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            config, original = self.fixture(directory)
            with self.assertRaisesRegex(ValueError, 'changed'):
                prepare_duration_config({**config, 'h3_workflow_sha256': 'bad'}, None, directory)
            workflow = json.loads(original)
            workflow['14']['inputs']['fps'] = 30
            data = json.dumps(workflow).encode('utf8')
            Path(config['h3_workflow']).write_bytes(data)
            config['h3_workflow_sha256'] = hashlib.sha256(data).hexdigest()
            with self.assertRaisesRegex(ValueError, 'stale'):
                prepare_duration_config(config, None, directory)

    def test_execution_receives_length_and_checks_decoded_output(self):
        with tempfile.TemporaryDirectory() as directory:
            config, _ = self.fixture(directory)
            output = Path(directory) / 'job/output.mp4'
            received = []
            def execute(inputs):
                derived = json.loads(Path(os.environ['OPENMONTAGE_LOCAL_CONFIG']).read_text())
                workflow = json.loads(Path(derived['h3_workflow']).read_text())
                received.append(workflow['6']['inputs']['length'])
                return SimpleNamespace(success=True, data={})
            runtime = SimpleNamespace(bootstrap=lambda: config,
                probe_media=lambda path: {'streams': [{'codec_type': 'video', 'nb_frames': '362', 'avg_frame_rate': '24/1'}]},
                write_json=lambda path, value: None)
            modules = {'lib': SimpleNamespace(), 'lib.local_runtime': runtime,
                'tools': SimpleNamespace(), 'tools.video': SimpleNamespace(),
                'tools.video.local_h3_video': SimpleNamespace(LocalH3Video=lambda: SimpleNamespace(execute=execute))}
            old = os.environ.get('OPENMONTAGE_LOCAL_CONFIG')
            with patch.dict(sys.modules, modules):
                result = execute_h3_with_duration({'wmDuration': '15.083s', 'prompt': 'Test', '_localReferencePaths': ['image.png']}, output)
                self.assertEqual(received, [362])
                self.assertEqual(result.data['timing']['frames'], 362)
                self.assertEqual(os.environ.get('OPENMONTAGE_LOCAL_CONFIG'), old)
                with self.assertRaisesRegex(ValueError, 'output timing'):
                    execute_h3_with_duration({'wmDuration': '5.167s', 'prompt': 'Test', '_localReferencePaths': ['image.png']}, output)
                self.assertEqual(os.environ.get('OPENMONTAGE_LOCAL_CONFIG'), old)
                output.with_suffix('.workflow.json').write_text(json.dumps({'6': {'inputs': {'length': 158}}}))
                with self.assertRaisesRegex(ValueError, 'refusing to resume'):
                    execute_h3_with_duration({'wmDuration': '5.167s'}, output)


if __name__ == '__main__':
    unittest.main()
