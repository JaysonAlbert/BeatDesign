import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace

from local_ref2va import describe_inputs, build_workflow, resolve_prompt, validate_reference, recover_submission
from local_flux3 import build_flux3_workflow, describe_flux3_inputs, RATIOS
from local_ref2va import input_fingerprint


class LocalModelTests(unittest.TestCase):
    def test_mixed_reference_order_and_graph_wiring(self):
        with tempfile.TemporaryDirectory() as directory:
            refs = []
            for index, kind in enumerate(['audio', 'image', 'video', 'image', 'audio']):
                path = Path(directory) / str(index)
                path.write_bytes(str(index).encode())
                refs.append({'type': kind, 'path': str(path), 'assetId': str(index)})
            spec = describe_inputs({'prompt': '@Audio1 @Image1 @Video1 @Image2 @Audio2', '_localReferences': refs, 'wmDuration': '5.875s'})
            self.assertEqual([r['label'] for r in spec['references']], ['<Audio 1>', '<Picture 1>', '<Video 1>', '<Picture 2>', '<Audio 2>'])
            graph = build_workflow(spec, ['a.wav', 'a.png', 'v.mp4', 'b.png', 'b.wav'], 42, 'test')
            self.assertEqual(graph['6']['inputs']['length'], 141)
            self.assertEqual(graph['6']['inputs']['prompt'], '<Audio 1> <Picture 1> <Video 1> <Picture 2> <Audio 2>')
            for key, cls in [('ref_images.ref_image_0', 'LoadImage'), ('ref_audios.ref_audio_1', 'LoadAudio'), ('ref_videos.ref_video_0', 'GetVideoComponents')]:
                node = graph['6']['inputs'][key][0]
                self.assertEqual(graph[node]['class_type'], cls)
            self.assertFalse(any('ref_video_audio' in k for k in graph['6']['inputs']))
            self.assertEqual(graph['16']['inputs']['lora_name'], 'minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors')

    def test_media_limits_reject_before_sampling(self):
        for kind, duration in [('video', 1), ('video', 16), ('audio', 16), ('audio', 0)]:
            with self.assertRaises(ValueError):
                validate_reference({'type': kind}, {'streams': [{'codec_type': kind}], 'format': {'duration': duration}})
        validate_reference({'type': 'video'}, {'streams': [{'codec_type': 'video'}], 'format': {'duration': 2}})
        with self.assertRaises(ValueError):
            describe_inputs({'prompt': 'empty', '_localReferences': []})

    def test_ambiguous_submit_recovers_original_id_or_stops_without_resubmitting(self):
        response = SimpleNamespace(raise_for_status=lambda: None, json=lambda: {'queue_running': [[0, 'original', {}, {'client_id': 'token'}]], 'queue_pending': []})
        history = SimpleNamespace(raise_for_status=lambda: None, json=lambda: {})
        with patch('requests.get', side_effect=[response, history]):
            self.assertEqual(recover_submission(SimpleNamespace(server_url='http://localhost'), {'client_id': 'token'}), 'original')
        with patch('requests.get', side_effect=[history, history]):
            with self.assertRaisesRegex(RuntimeError, 'uncertain'):
                recover_submission(SimpleNamespace(server_url='http://localhost'), {'client_id': 'token'})

    def test_flux_uses_existing_weights_upsampling_and_selected_dimensions(self):
        for ratio, dimensions in RATIOS.items():
            graph = build_flux3_workflow({'prompt': 'A blue cup', 'aspect_ratio': ratio}, 17, 'test')
            self.assertEqual([graph['6']['inputs'][k] for k in ['width', 'height']], dimensions)
            self.assertEqual(graph['7']['inputs']['steps'], 16)
            self.assertEqual(graph['7']['inputs']['cfg'], 1)
            self.assertEqual(graph['4']['inputs']['text'], ['11', 0])
            self.assertIn('A blue cup', graph['11']['inputs']['prompt'])
            self.assertTrue(graph['10']['inputs']['clip_name'].endswith('_int8_convrot.safetensors'))
        self.assertEqual(resolve_prompt('@Image2 @Audio3 and <Video 1>'), '<Picture 2> <Audio 3> and <Video 1>')

    def test_flux_single_and_multi_reference_conditioning_and_vision_order(self):
        for count in [1, 2, 10]:
            staged = [('ref-{}.png'.format(i), 'vision-{}.png'.format(i)) for i in range(count)]
            graph = build_flux3_workflow({'prompt': 'Edit reference image 1', 'aspect_ratio': '4:3'}, 17, 'test', staged)
            self.assertEqual(graph['7']['inputs']['positive'], ['13', 0])
            self.assertEqual(graph['7']['inputs']['negative'], ['13', 1])
            self.assertEqual(graph['7']['inputs']['latent_image'], ['6', 0])
            self.assertEqual(graph['11']['inputs']['image'], ['14', 0])
            self.assertIn('image-editing', graph['11']['inputs']['system_prompt'])
            for i in range(count):
                source = graph['13']['inputs']['images.image{}'.format(i)][0]
                vision = graph['14']['inputs']['images.image{}'.format(i)][0]
                self.assertEqual(graph[source]['inputs']['image'], staged[i][0])
                self.assertEqual(graph[vision]['inputs']['image'], staged[i][1])

    def test_flux_fingerprint_tracks_reference_content_order_and_aliases(self):
        with tempfile.TemporaryDirectory() as directory:
            paths = [Path(directory) / str(i) for i in range(2)]
            for i, path in enumerate(paths):
                path.write_bytes(str(i).encode())
            refs = [{'type': 'image', 'assetId': str(i), 'path': str(p)} for i, p in enumerate(paths)]
            inputs = {'prompt': 'Combine @Image1 and <ref_image_1>', '_localReferences': refs}
            spec = describe_flux3_inputs(inputs)
            self.assertEqual(spec['resolvedPrompt'], 'Combine reference image 1 and reference image 2')
            self.assertEqual([r['modelLabel'] for r in spec['references']], ['<ref_image_0>', '<ref_image_1>'])
            original = input_fingerprint(spec)
            self.assertNotEqual(original, input_fingerprint(describe_flux3_inputs({**inputs, '_localReferences': refs[::-1]})))
            paths[0].write_bytes(b'changed')
            self.assertNotEqual(original, input_fingerprint(describe_flux3_inputs(inputs)))
            for invalid in [refs * 6, [{**refs[0], 'type': 'video'}]]:
                with self.assertRaises(ValueError):
                    describe_flux3_inputs({**inputs, '_localReferences': invalid})
            with self.assertRaisesRegex(ValueError, 'unattached'):
                describe_flux3_inputs({**inputs, 'prompt': '@Image3'})


if __name__ == '__main__':
    unittest.main()
