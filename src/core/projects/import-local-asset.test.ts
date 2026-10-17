import assert from 'node:assert/strict';
import test from 'node:test';

import {
  importLocalProjectAsset,
  validateLocalAssetImportCandidate,
  LOCAL_PROJECT_AUDIO_MAX_FILE_SIZE,
} from './import-local-asset';
import { validateUploadedAudioFile } from '@/core/effects/validation';

test('full narration stems import locally without relaxing generation reference limits', () => {
  const size = 34_272_044;
  assert.equal(validateLocalAssetImportCandidate({ filename: 'effects-stem.wav', size }).mediaType, 'audio');
  assert.equal(validateUploadedAudioFile({ size, type: 'audio/wav' }).ok, false);
  assert.equal(validateUploadedAudioFile({ size: 15 * 1024 * 1024, type: 'audio/wav' }).ok, true);
  assert.equal(validateUploadedAudioFile({ size: 15 * 1024 * 1024 + 1, type: 'audio/wav' }).ok, false);
  assert.equal(validateLocalAssetImportCandidate({ filename: 'stem.wav', size: LOCAL_PROJECT_AUDIO_MAX_FILE_SIZE }).mediaType, 'audio');
  assert.throws(() => validateLocalAssetImportCandidate({ filename: 'stem.wav', size: LOCAL_PROJECT_AUDIO_MAX_FILE_SIZE + 1 }), /size is not supported/);
  assert.throws(() => validateLocalAssetImportCandidate({ filename: 'script.exe', size }), /Unsupported project asset type/);
});

test('a larger local audio allowance still rejects unsupported MIME types', () => {
  const result = validateUploadedAudioFile(
      { size: 34_272_044, type: 'application/octet-stream' },
      { maxBytes: LOCAL_PROJECT_AUDIO_MAX_FILE_SIZE }
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'AUDIO_TYPE_UNSUPPORTED');
    assert.equal(result.maxBytes, LOCAL_PROJECT_AUDIO_MAX_FILE_SIZE);
  }
});

test('asset import rejects a relative file path', async () => {
  await assert.rejects(
    () =>
      importLocalProjectAsset({
        projectId: 'project-1',
        filePath: 'clip.mp4',
      }),
    /absolute file path/i
  );
});

test('asset import rejects a missing file path', async () => {
  await assert.rejects(
    () =>
      importLocalProjectAsset({
        projectId: 'project-1',
        filePath: '/tmp/beatdesign-missing-asset-file.mp4',
      }),
    /not found/i
  );
});
