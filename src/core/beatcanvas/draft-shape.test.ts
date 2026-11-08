import assert from 'node:assert/strict';
import test from 'node:test';
import type { CanvasOutputCard } from './canvas-types';
import { buildGenerationNodeCaption, buildCanvasShotOutline } from './draft-shape';
const makeOutput = (
  id: string,
  capturedAt: string,
  status: CanvasOutputCard['status'] = 'succeeded'
): CanvasOutputCard => ({
  id,
  kind: 'output',
  type: 'image',
  name: id,
  url: status === 'succeeded' ? `https://example.com/${id}.webp` : null,
  prompt: '',
  referenceCardIds: ['draft-1'],
  workflowTemplateId: null,
  status,
  error: null,
  modelId: 'model',
  aspectRatio: '1:1',
  outputQuality: '1k',
  duration: '5s',
  mode: 'quality',
  variant: 'standard',
  quality: 'standard',
  sourceGenerationId: `task:${id}`,
  sourceConfigCardId: 'draft-1',
  generationRunId: `run:${id}`,
  generationSnapshot: {
    type: 'image',
    prompt: id,
    referenceCardIds: [],
    workflowTemplateId: null,
    modelId: 'model',
    aspectRatio: '1:1',
    outputQuality: '1k',
    duration: '5s',
    mode: 'quality',
    variant: 'standard',
    quality: 'standard',
    capturedAt,
  },
});


test('shot caption describes the displayed pinned take rather than the latest attempt', () => {
  const old = { ...makeOutput('old', '2026-11-08T01:00:00Z'), durationSec: 6 };
  const newer = { ...makeOutput('new', '2026-11-08T02:00:00Z'), durationSec: 8 };
  const card = { ...old, id: 'draft-1', kind: 'generation' as const,
    type: 'video' as const, name: 'S04 · 炒蛋提议 · t02候选', pinnedOutputId: old.id };
  const caption = buildGenerationNodeCaption(card, [newer, old]);
  assert.equal(caption.shotCode, 'S04');
  assert.equal(caption.displayTitle, '炒蛋提议');
  assert.equal(caption.durationLabel, '6s');
  assert.equal(caption.takeNumber, 1);
  assert.equal(caption.hasCandidate, true);
  assert.equal(buildGenerationNodeCaption(card, []).hasCandidate, false);
});
test('outline lists video parents once in shot order and excludes analysis and output nodes', () => {
  const output = makeOutput('out', '2026-11-08T01:00:00Z');
  const base = { ...output, kind: 'generation' as const, type: 'video' as const };
  const cards = {
    s10: { ...base, id: 's10', name: 'S10 · Ending' },
    s02: { ...base, id: 's02', name: 'S02 · Breakfast' },
    analysis: { ...base, id: 'analysis', generationMode: 'analysis' as const },
    image: { ...base, id: 'image', type: 'image' as const },
    out: output,
  };
  assert.deepEqual(buildCanvasShotOutline(cards).map(item => item.id), ['s02', 's10']);
});
