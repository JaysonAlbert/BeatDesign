from pathlib import Path
import tempfile
import unittest
from local_narration import describe_narration, server_audio_path


class NarrationTests(unittest.TestCase):
    def probe(self, path):
        return {'streams': [{'codec_type': 'audio'}], 'format': {'duration': '12'}}

    def test_windows_reference_mount(self):
        self.assertEqual(server_audio_path(r'D:\Project with spaces\voice.wav'), '/mnt/d/Project with spaces/voice.wav')
        with self.assertRaises(ValueError):
            server_audio_path(r'\\remote\share\voice.wav')

    def test_reference_hash_transcript_and_redo_identity(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'voice.wav'; path.write_bytes(b'RIFFfixtureWAVE')
            inputs = {'prompt': 'Come back, cat!', 'reference_text': 'A lovely day.',
                      '_localReferences': [{'assetId': 'voice', 'path': str(path), 'type': 'audio'}]}
            payload, refs, fingerprint = describe_narration(inputs, self.probe)
            self.assertEqual(payload['references'][0]['text'], inputs['reference_text'])
            self.assertEqual(refs[0]['assetId'], 'voice')
            self.assertEqual(len(refs[0]['sha256']), 64)
            self.assertEqual(describe_narration(inputs, self.probe)[2], fingerprint)
            next_payload, next_refs, _ = describe_narration({**inputs, 'prompt': 'Stay here!'}, self.probe)
            self.assertEqual(next_refs, refs)
            self.assertEqual(next_payload['references'], payload['references'])
            path.write_bytes(b'changed');self.assertNotEqual(describe_narration(inputs, self.probe)[2], fingerprint)

    def test_reference_limits_and_pairing(self):
        with self.assertRaises(ValueError):describe_narration({'prompt':'Hello', 'reference_text':'Ref'}, self.probe)
        with self.assertRaises(ValueError):describe_narration({'prompt':'x'*201}, self.probe)
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'voice.wav';path.write_bytes(b'RIFF')
            inputs={'prompt':'Hi', 'reference_text':'Ref','_localReferences':[{'assetId':'voice','type':'audio','path':str(path)}]}
            with self.assertRaises(ValueError):describe_narration(inputs, lambda p:{'streams':[{'codec_type':'audio'}],'format':{'duration':'31'}})


if __name__ == '__main__':unittest.main()
