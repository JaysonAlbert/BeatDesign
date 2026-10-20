import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveNarrativeScope } from './navigation';
test('scope resolves stable scene/document IDs without writing or crossing scenes', () => {
  const directory = {
    projectId: 'p',
    scenes: [
      { id: 's1', archivedAt: null },
      { id: 's2', archivedAt: 1 },
      { id: 'empty', archivedAt: null },
    ],
    canvases: [
      { id: 'default:p', sceneId: null, archivedAt: null },
      { id: 'c', sceneId: 's1', archivedAt: null },
    ],
  };
  const before = JSON.stringify(directory);
  assert.equal(resolveNarrativeScope(directory, {}).canvasId, 'default:p');
  assert.equal(
    resolveNarrativeScope(directory, { sceneId: 's1' }).canvasId,
    'c',
  );
  assert.equal(
    resolveNarrativeScope(directory, { canvasId: 'c' }).sceneId,
    's1',
  );
  assert.equal(
    resolveNarrativeScope(directory, { sceneId: 's1', canvasId: 'default:p' })
      .error,
    'canvas_unavailable',
  );
  assert.equal(
    resolveNarrativeScope(directory, { sceneId: 's2' }).error,
    'scene_unavailable',
  );
  assert.equal(
    resolveNarrativeScope(directory, { sceneId: 'empty' }).canvasId,
    null,
  );
  assert.equal(JSON.stringify(directory), before);
});
