import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { after, test } from 'node:test';
import { buildTextCard } from '@/core/beatcanvas/text-nodes';
import type { CanvasCard } from '@/core/beatcanvas/canvas-types';

const directory = await mkdtemp(
  join(tmpdir(), 'beatdesign-source-intent-test-')
);
process.env.BEATDESIGN_DATA_DIR = directory;
process.env.BEATDESIGN_GENERATION_PROVIDER = 'workstation';
execFileSync(
  process.execPath,
  ['node_modules/drizzle-kit/bin.cjs', 'push', '--force'],
  { env: process.env, stdio: 'pipe', windowsHide: true }
);
const { createProject, loadProjectWithLatestSnapshot, saveProjectSnapshot } =
  await import('@/core/projects/projects');
const { createEmptyProjectSnapshot } =
  await import('@/core/projects/project-snapshot');
const { getActiveGenerationProvider } =
  await import('@/core/generation-providers/registry');
const {
  createAssetFirstGenerationIntent,
  submitAssetFirstGeneration,
  preflightAssetFirstGeneration,
} = await import('@/core/generation-providers/submit');
const { getGenerationUploadIntentSourceContext } =
  await import('@/core/effects/generation-upload-intent');
const provider = getActiveGenerationProvider();
const configured = provider.assertConfigured;
const createAdapter = provider.createAdapter;
let adapterCalls = 0;
provider.assertConfigured = async () => {};
provider.createAdapter = () => {
  adapterCalls++;
  throw new Error('No provider calls permitted in source-intent fixture.');
};

test('an intent for a scene Canvas cannot be submitted against the default or another document', async () => {
  const project = await createProject({ name: 'Document-scoped source' });
  const { applyNarrativeCommand } = await import('@/core/series/narrative');
  await applyNarrativeCommand({ projectId: project.id, commandId: 'doc-create', idempotencyKey: 'doc-create', expectedRevision: 0, command: { type: 'create_canvas', canvasId: 'scoped-source-canvas', name: 'Scene work' } });
  const loaded = (await loadProjectWithLatestSnapshot({ projectId: project.id, canvasId: 'scoped-source-canvas' }))!;
  const card = { ...buildTextCard({ id: 'scene-generation', name: 'Reviewed scene step' }), kind: 'generation', type: 'image', modelId: 'local-flux3-klein', prompt: 'Synthetic fixture' } as CanvasCard;
  await saveProjectSnapshot({ projectId: project.id, canvasId: 'scoped-source-canvas', document: { ...loaded.snapshot, cards: [card] }, baseVersion: loaded.snapshotVersion });
  const request = { version: 2, projectId: project.id, canvasId: 'scoped-source-canvas', sourceSurface: 'canvas', sourceCardId: card.id, mode: 'image', modelId: card.modelId, prompt: card.prompt, references: [], parameters: { aspect_ratio: '1:1' } };
  const intent = await createAssetFirstGenerationIntent(request);
  const context = await getGenerationUploadIntentSourceContext({ intentId: intent, projectId: project.id });
  assert.equal(context?.sourceCardId, card.id);
  assert.equal(typeof context?.sourceContextDigest, 'string');
  await applyNarrativeCommand({ projectId: project.id, commandId: 'target-create', idempotencyKey: 'target-create', expectedRevision: 1, command: { type: 'create_canvas', canvasId: 'intent-target', name: 'Transfer target' } });
  const { previewCanvasTransfer } = await import('@/core/series/canvas-transfer');
  const { getDb } = await import('@/core/workspace-lib/db-adapter');
  const { generationHistory } = await import('@/config/db/schema');
  await (await getDb()).insert(generationHistory).values({ id: 'synthetic-running-job', projectId: project.id, effectId: 1, status: 'processing', input: { _source: { canvasSource: { sourceCardId: card.id, canvasId: 'scoped-source-canvas' } } } });
  const transfer = await previewCanvasTransfer({ projectId: project.id, sourceCanvasId: 'scoped-source-canvas', targetCanvasId: 'intent-target', selectedCardIds: [card.id], includeDependencies: true });
  assert.ok(transfer.blockers.some(b => /unexpired/.test(b)));
  assert.ok(transfer.blockers.some(b => /running generation jobs/.test(b)));


  await assert.rejects(() => submitAssetFirstGeneration({ generation: { ...request, canvasId: undefined }, origin: 'ui', generationIntentId: intent }), /source|precheck|changed|found/i);
  assert.equal(adapterCalls, 0);
});
after(async () => {
  provider.assertConfigured = configured;
  provider.createAdapter = createAdapter;
  const { getDb } = await import('@/core/workspace-lib/db-adapter');
  (await getDb()).$client.close();
  assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});

test('stale Canvas precheck and omission of source identity reject before provider dispatch', async () => {
  const project = await createProject({
    name: 'Synthetic source intent fixture',
  });
  const state = await loadProjectWithLatestSnapshot({ projectId: project.id });
  const card = {
    ...buildTextCard({ id: 'source', name: 'Synthetic draft' }),
    kind: 'generation',
    type: 'image',
    modelId: 'local-flux3-klein',
    prompt: 'Synthetic fixture',
  } as CanvasCard;
  const document = { ...createEmptyProjectSnapshot(), cards: [card] };
  await saveProjectSnapshot({
    projectId: project.id,
    document,
    baseVersion: state!.snapshotVersion,
  });
  const request = {
    version: 2,
    projectId: project.id,
    sourceSurface: 'canvas',
    sourceCardId: card.id,
    mode: 'image',
    modelId: card.modelId,
    prompt: card.prompt,
    references: [],
    parameters: { aspect_ratio: '1:1' },
  };
  await assert.rejects(
    () =>
      createAssetFirstGenerationIntent({
        ...request,
        parameters: { aspect_ratio: '9:16' },
      }),
    /aspect_ratio.*reviewed/i
  );
  assert.equal(adapterCalls, 0);
  const intent = await createAssetFirstGenerationIntent(request);
  assert.equal(
    (
      await getGenerationUploadIntentSourceContext({
        intentId: intent,
        projectId: project.id,
      })
    )?.sourceCardId,
    card.id
  );
  const before = await loadProjectWithLatestSnapshot({ projectId: project.id });
  await saveProjectSnapshot({
    projectId: project.id,
    document: { ...document, cards: [{ ...card, duration: '10s' }] },
    baseVersion: before!.snapshotVersion,
  });
  await assert.rejects(
    () =>
      submitAssetFirstGeneration({
        generation: request,
        origin: 'ui',
        generationIntentId: intent,
      }),
    /changed after precheck/
  );
  const { sourceCardId: _, sourceSurface: __, ...standalone } = request;
  await assert.rejects(
    () =>
      submitAssetFirstGeneration({
        generation: standalone,
        origin: 'ui',
        generationIntentId: intent,
      }),
    /changed after precheck/
  );
  await assert.rejects(
    () =>
      preflightAssetFirstGeneration({ ...request, sourceCardId: undefined }),
    /sourceCardId/
  );
  assert.equal(adapterCalls, 0);
});
