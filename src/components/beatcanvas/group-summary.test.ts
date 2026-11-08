import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTextCard } from '@/core/beatcanvas/text-nodes';
import type { CanvasCard } from '@/core/beatcanvas/canvas-types';
import type { ShotGroup } from '@/core/organization/canvas-organization';
import { summarizeCanvasGroup } from './group-summary';

const group: ShotGroup = {
  id: 'cover', name: 'Cover', role: 'packaging', memberCardIds: ['draft', 'note'],
  collapsed: true, resultCardId: 'draft',
  summaryFrame: { x: 0, y: 0, w: 468, h: 300 },
  expandedFrame: { x: 0, y: 0, w: 528, h: 850 },
};

test('summary previews the pinned take without counting hidden take history as contents', () => {
  const note = buildTextCard({ id: 'note', name: 'Cover copy', textContent: '# Headline\n\nEnglish title' });
  const draft = { ...note, id: 'draft', name: 'Cover image', type: 'image', kind: 'generation', pinnedOutputId: 'old' } as CanvasCard;
  const old = { ...draft, id: 'old', kind: 'output', status: 'succeeded', sourceConfigCardId: 'draft', url: '/old.png', generationSnapshot: { ...draft, type: 'image', capturedAt: '2026-11-08T00:00:00Z' } } as CanvasCard;
  const latest = { ...old, id: 'latest', url: '/latest.png' } as CanvasCard;
  const document = { cards: [draft, note, old, latest], frames: {} };
  const before = structuredClone(document);
  const summary = summarizeCanvasGroup(document, group);
  assert.deepEqual(summary.counts, { generation: 1, text: 1 });
  assert.deepEqual(summary.members.map((item) => item.id), ['draft', 'note']);
  assert.equal(summary.preview?.url, '/old.png');
  assert.equal(summary.excerpt, 'Headline English title');
  assert.deepEqual(document, before);
  draft.pinnedOutputId = 'latest';
  assert.equal(summarizeCanvasGroup(document, group).preview?.url, '/latest.png');
});

test('document-only and missing-member groups have truthful summaries without fabricated media', () => {
  const note = buildTextCard({ id: 'note', name: 'Story brief', textContent: 'A child makes a choice.' });
  const summary = summarizeCanvasGroup({ cards: [note], frames: {} }, group);
  assert.deepEqual(summary.counts, { text: 1 });
  assert.equal(summary.preview, null);
  assert.equal(summary.members[0].name, 'Story brief');
  const empty = summarizeCanvasGroup({ cards: [], frames: {} }, group);
  assert.deepEqual(empty.members, []);
  assert.equal(empty.preview, null);
  assert.equal(empty.excerpt, '');
});
