import assert from 'node:assert/strict';
import test from 'node:test';
import type { CanvasCard } from '@/core/beatcanvas/canvas-types';
import { resolveNarrativeScope } from '@/core/series/navigation';
import { canvasDirectoryHref, canvasDocumentHref, sceneCanvasHref, sceneAssetsHref, summarizeDirectoryCanvas } from './canvas-directory-model';

test('directory, concrete canvas and scene assets have distinct explicit destinations', () => {
  assert.equal(canvasDirectoryHref('p'), '/canvas/p?view=directory');
  const narrative = { projectId: 'p', scenes: [{ id: 'kitchen', archivedAt: null }], canvases: [
    { id: 'default:p', sceneId: null, archivedAt: null },
    { id: 'first', sceneId: 'kitchen', archivedAt: null },
    { id: 'second', sceneId: 'kitchen', archivedAt: null },
  ] };
  const request = (url: string) => Object.fromEntries(new URL(url, 'http://localhost').searchParams);
  assert.equal(resolveNarrativeScope(narrative, request(sceneCanvasHref('p', 'kitchen'))).canvasId, 'first');
  assert.equal(resolveNarrativeScope(narrative, request(canvasDocumentHref('p', 'second', 'kitchen'))).canvasId, 'second');
  assert.equal(request(sceneAssetsHref('p', 'kitchen')).scope, 'scene');
  assert.equal(request(canvasDocumentHref('p', 'default:p')).sceneId, undefined);
  assert.equal(request(canvasDocumentHref('p /', 'canvas &', '场次')).canvasId, 'canvas &');
});

test('directory counts selected media once, leaves history and text unmodified', () => {
  const card = (data: Partial<CanvasCard>) => ({ id: 'base', kind: 'asset', type: 'image', name: 'Image', url: '/image', status: 'succeeded', referenceCardIds: [], ...data }) as CanvasCard;
  const generation = card({ id: 'shot', kind: 'generation', type: 'video', url: null, pinnedOutputId: 'old', status: 'processing' });
  const output = (id: string, capturedAt: string) => card({ id, kind: 'output', type: 'video', assetId: id, url: `/video/${id}`, sourceConfigCardId: 'shot', generationSnapshot: { capturedAt } as never });
  const document = { version: 4 as const, cards: [generation, output('old', '2026-01-01'), output('new', '2026-02-01'), card({ id: 'reference', assetId: 'shared' }), card({ id: 'same-reference', assetId: 'shared' }), card({ id: 'script', kind: 'text', type: 'text', textContent: 'Breakfast story', url: null })], frames: {} };
  const before = JSON.stringify(document);
  const summary = summarizeDirectoryCanvas(document);
  assert.equal(summary.videos, 1);
  assert.equal(summary.images, 1);
  assert.equal(summary.text, 1);
  assert.equal(summary.active, 1);
  assert.equal(summary.previews[0].assetId, 'old');
  assert.equal(summary.excerpt, 'Breakfast story');
  assert.equal(JSON.stringify(document), before);
});
