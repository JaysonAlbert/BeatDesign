import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildTextCard } from '@/core/beatcanvas/text-nodes';
import type { CanvasCard } from '@/core/beatcanvas/canvas-types';

test('shared versions pin 20 consumers; selecting three changes only three, stale reviews roll back and detach preserves pins', async () => {
  process.env.BEATDESIGN_DATA_DIR = await mkdtemp(
    join(tmpdir(), 'beatdesign-shared-series-'),
  );
  execFileSync(
    process.execPath,
    ['node_modules/drizzle-kit/bin.cjs', 'push', '--force'],
    { stdio: 'pipe', windowsHide: true, env: process.env },
  );
  const { createProject, saveProjectSnapshot, loadProjectWithLatestSnapshot } =
    await import('@/core/projects/projects');
  const { defaultCanvasId } = await import('@/core/projects/canvas-identity');
  const { applySeriesCommand, getSeries } = await import('./service');
  const { getNarrative } = await import('./narrative');
  const { applySharedCommand, getSharedLibrary } =
    await import('./shared-assets');
  const { applyReferenceReview, previewReferenceReview } =
    await import('./reference-review');
  const { recordUserAsset, linkProjectAsset, getProjectAssetById } =
    await import('@/core/workspace-lib/assets/user-assets');
  const { persistBeatDesignCommand } = await import('@/core/commands/persist');
  const { getOrganization } = await import('@/core/organization/service');
  const { previewCanvasTransfer, applyCanvasTransfer } =
    await import('./canvas-transfer');
  const { applyNarrativeCommand } = await import('./narrative');
  const a = await createProject({ name: 'Episode A' });
  const b = await createProject({ name: 'Episode B' });
  const foreign = await createProject({ name: 'Unrelated' });
  let sequence = 0;
  const seriesId = 'series-test';
  const seriesWrite = async (command: any) => {
    const id = `series-${++sequence}`;
    return applySeriesCommand({
      seriesId,
      commandId: id,
      idempotencyKey: id,
      expectedRevision: (await getSeries(seriesId))?.revision ?? 0,
      command,
    });
  };
  const sharedWrite = async (command: any) => {
    const id = `shared-${++sequence}`;
    return applySharedCommand({
      seriesId,
      commandId: id,
      idempotencyKey: id,
      expectedRevision: (await getSeries(seriesId))!.revision,
      command,
    });
  };
  await seriesWrite({ type: 'create', name: 'Synthetic series' });
  for (const p of [a, b])
    await seriesWrite({
      type: 'attach_episode',
      episodeId: `episode-${p.id}`,
      projectId: p.id,
      narrativeRevision: (await getNarrative(p.id)).revision,
    });
  for (const id of ['image-v1', 'image-v2']) {
    await recordUserAsset({
      id,
      type: 'image',
      source: 'upload',
      bucket: 'fixture',
      objectKey: id,
      publicUrl: `/fixture/${id}`,
    });
    await linkProjectAsset({ projectId: a.id, assetId: id, role: 'upload' });
  }
  await sharedWrite({
    type: 'publish_element',
    elementId: 'hero',
    versionId: 'hero-v1',
    name: 'Hero',
    kind: 'character',
    sourceProjectId: a.id,
    assetId: 'image-v1',
  });
  for (const p of [a, b]) {
    const state = (await loadProjectWithLatestSnapshot({ projectId: p.id }))!;
    const cards = Array.from(
      { length: 10 },
      (_, index) =>
        ({
          ...buildTextCard({ id: `step-${index}`, name: `Step ${index}` }),
          kind: 'generation',
          type: 'image',
          modelId: 'local-flux3-klein',
        }) as CanvasCard,
    );
    await saveProjectSnapshot({
      projectId: p.id,
      document: {
        ...state.snapshot,
        cards,
        frames: Object.fromEntries(
          cards.map((c, i) => [c.id, { x: 400, y: i * 300, w: 320, h: 220 }]),
        ),
      },
      baseVersion: state.snapshotVersion,
    });
    const id = `bindings-${p.id}`;
    const result = await persistBeatDesignCommand({
      projectId: p.id,
      canvasId: defaultCanvasId(p.id),
      origin: 'mcp',
      commandId: id,
      idempotencyKey: id,
      expectedRevision: 2,
      command: {
        type: 'canvas.apply',
        operations: cards.map((card, index) => ({
          type: 'bind_element',
          bindingId: `binding-${index}`,
          consumerCardId: card.id,
          scope: 'series',
          ownerId: seriesId,
          elementId: 'hero',
          versionId: 'hero-v1',
          assetId: 'image-v1',
          referenceCardId: 'shared-v1',
          order: 0,
          role: 'subject',
        })),
      },
    });
    assert.equal(result.ok, true, JSON.stringify(result));
  }
  assert.equal(
    (await getSharedLibrary(seriesId)).elements[0].consumers.length,
    20,
  );
  await sharedWrite({
    type: 'add_version',
    elementId: 'hero',
    versionId: 'hero-v2',
    sourceProjectId: a.id,
    assetId: 'image-v2',
  });
  await sharedWrite({
    type: 'set_current',
    elementId: 'hero',
    observedCurrentVersionId: 'hero-v1',
    versionId: 'hero-v2',
  });
  const selection = [0, 1, 2].map((i) => ({
    projectId: a.id,
    canvasId: defaultCanvasId(a.id),
    bindingId: `binding-${i}`,
  }));
  const preview = await previewReferenceReview({
    seriesId,
    mode: 'adopt',
    elementId: 'hero',
    targetVersionId: 'hero-v2',
    selectedConsumers: selection,
  });
  assert.equal(
    (await loadProjectWithLatestSnapshot({ projectId: a.id }))!.snapshot
      .organization!.elementBindings['binding-0'].versionId,
    'hero-v1',
  );
  const review = {
    seriesId,
    commandId: 'adopt-three',
    idempotencyKey: 'adopt-three',
    expectedRevision: preview.seriesRevision,
    previewToken: preview.previewToken,
  };
  // Abort at the final receipt insert, after grants and all Canvas writes.
  const { createClient } = await import('@libsql/client');
  const { getBeatDesignDatabaseUrl } = await import('@/config/data-root');
  const faultDb = createClient({ url: getBeatDesignDatabaseUrl() });
  await faultDb.execute(
    "CREATE TRIGGER fail_series_receipt BEFORE INSERT ON series_command_receipt WHEN NEW.command_id='adopt-three' BEGIN SELECT RAISE(ABORT,'injected receipt failure'); END",
  );
  await assert.rejects(
    () => applyReferenceReview(review),
    (error: any) =>
      /injected receipt failure/.test(error.cause?.message ?? error.message),
  );
  assert.equal(
    Object.values(
      (await loadProjectWithLatestSnapshot({ projectId: a.id }))!.snapshot
        .organization!.elementBindings,
    ).filter((x) => x.versionId === 'hero-v2').length,
    0,
  );
  assert.equal(
    (
      await faultDb.execute(
        "SELECT count(*) AS n FROM series_command_receipt WHERE command_id='adopt-three'",
      )
    ).rows[0].n,
    0,
  );
  await faultDb.execute('DROP TRIGGER fail_series_receipt');
  faultDb.close();
  await applyReferenceReview(review);
  await applyReferenceReview(review);
  const afterA = (await loadProjectWithLatestSnapshot({ projectId: a.id }))!
    .snapshot;
  const afterB = (await loadProjectWithLatestSnapshot({ projectId: b.id }))!
    .snapshot;
  assert.equal(
    Object.values(afterA.organization!.elementBindings).filter(
      (x) => x.versionId === 'hero-v2',
    ).length,
    3,
  );
  assert.equal(
    Object.values(afterB.organization!.elementBindings).filter(
      (x) => x.versionId === 'hero-v2',
    ).length,
    0,
  );
  assert.equal(
    afterA.cards.find((c) => c.id === 'shared-v1')!.assetId,
    'image-v1',
  );
  assert.notEqual(
    afterA.cards.find((c) => c.id === 'step-0')!.referenceCardIds[0],
    afterA.cards.find((c) => c.id === 'step-3')!.referenceCardIds[0],
  );
  await assert.rejects(
    async () =>
      saveProjectSnapshot({
        projectId: a.id,
        document: { ...afterA, version: 4 },
        baseVersion: (await loadProjectWithLatestSnapshot({ projectId: a.id }))!
          .snapshotVersion,
      }),
    /v5 client/,
  );
  const { getScopedAssetDetails } = await import('./asset-details');
  const detail = await getScopedAssetDetails(a.id, 'image-v2', seriesId);
  assert.equal(detail.consumers.length, 3);
  assert.equal(detail.elementVersions[0].elementId, 'hero');
  assert.equal(detail.elementVersions[0].versionId, 'hero-v2');
  const stale = await previewReferenceReview({
    seriesId,
    mode: 'adopt',
    elementId: 'hero',
    targetVersionId: 'hero-v2',
    selectedConsumers: [
      {
        projectId: b.id,
        canvasId: defaultCanvasId(b.id),
        bindingId: 'binding-0',
      },
    ],
  });
  await seriesWrite({ type: 'update', description: 'Concurrent change' });
  await assert.rejects(
    () =>
      applyReferenceReview({
        ...review,
        commandId: 'stale',
        idempotencyKey: 'stale',
        expectedRevision: stale.seriesRevision,
        previewToken: stale.previewToken,
      }),
    /Preview changed|changed/i,
  );
  assert.equal(
    await getProjectAssetById({ projectId: b.id, assetId: 'image-v2' }),
    null,
  );
  const { previewSharedArchive, querySharedConsumers } =
    await import('./shared-assets');
  const pageOne = await querySharedConsumers(seriesId, 'hero', undefined, 7);
  assert.equal(pageOne.total, 20);
  assert.equal(pageOne.consumers.length, 7);
  const pageTwo = await querySharedConsumers(
    seriesId,
    'hero',
    pageOne.nextCursor!,
    7,
  );
  assert.equal(
    pageTwo.consumers.some((c) => pageOne.consumers.some((p) => p.id === c.id)),
    false,
  );
  await assert.rejects(
    () =>
      sharedWrite({
        type: 'archive_element',
        elementId: 'hero',
        archived: true,
      }),
    /Preview/,
  );
  const archive = await previewSharedArchive({ seriesId, elementId: 'hero' });
  await sharedWrite({
    type: 'archive_element',
    elementId: 'hero',
    archived: true,
    previewToken: archive.previewToken,
  });
  assert.equal(
    (await getSharedLibrary(seriesId)).elements[0].consumers.length,
    20,
  );
  await sharedWrite({
    type: 'archive_element',
    elementId: 'hero',
    archived: false,
  });
  const wrong = await persistBeatDesignCommand({
    projectId: foreign.id,
    origin: 'mcp',
    commandId: 'foreign',
    idempotencyKey: 'foreign',
    expectedRevision: 1,
    command: {
      type: 'canvas.apply',
      operations: [
        {
          type: 'bind_element',
          bindingId: 'foreign',
          consumerCardId: 'none',
          scope: 'series',
          ownerId: seriesId,
          elementId: 'hero',
          versionId: 'hero-v1',
          assetId: 'image-v1',
          referenceCardId: 'foreign-ref',
          order: 0,
          role: 'reference',
        },
      ],
    },
  });
  assert.equal(wrong.ok, false);
  const detach = await previewReferenceReview({
    seriesId,
    mode: 'detach',
    projectId: b.id,
  });
  await applyReferenceReview({
    ...review,
    commandId: 'detach',
    idempotencyKey: 'detach',
    expectedRevision: detach.seriesRevision,
    previewToken: detach.previewToken,
  });
  assert.equal((await getNarrative(b.id)).episode, null);
  const local = (await loadProjectWithLatestSnapshot({ projectId: b.id }))!
    .snapshot;
  assert.equal(
    Object.values(local.organization!.elementBindings).every(
      (x) => x.scope === 'project',
    ),
    true,
  );
  assert.equal(
    Object.values((await getOrganization(b.id)).document.elements)[0]
      .seriesSource?.seriesId,
    seriesId,
  );
  assert.ok(
    await getProjectAssetById({ projectId: b.id, assetId: 'image-v1' }),
  );
  assert.equal(
    (await getSharedLibrary(seriesId)).elements[0].versions.length,
    2,
  );
  // A complete connected dependency set transfers atomically, retaining old source IDs.
  const n = await getNarrative(a.id);
  await applyNarrativeCommand({
    projectId: a.id,
    commandId: 'new-canvas',
    idempotencyKey: 'new-canvas',
    expectedRevision: n.revision,
    command: {
      type: 'create_canvas',
      canvasId: 'target-canvas',
      name: 'Second scene',
    },
  });
  const blocked = await previewCanvasTransfer({
    projectId: a.id,
    sourceCanvasId: defaultCanvasId(a.id),
    targetCanvasId: 'target-canvas',
    selectedCardIds: ['step-3'],
  });
  assert.ok(blocked.blockers.length);
  const transfer = await previewCanvasTransfer({
    projectId: a.id,
    sourceCanvasId: defaultCanvasId(a.id),
    targetCanvasId: 'target-canvas',
    selectedCardIds: ['step-3'],
    includeDependencies: true,
  });
  assert.equal(transfer.blockers.length, 0);
  await applyCanvasTransfer({
    projectId: a.id,
    commandId: 'transfer',
    idempotencyKey: 'transfer',
    expectedRevision: transfer.sourceRevision,
    previewToken: transfer.previewToken,
  });
  assert.ok(
    (await loadProjectWithLatestSnapshot({
      projectId: a.id,
      canvasId: 'target-canvas',
    }))!.snapshot.cards.some((c) => c.id === 'step-3'),
  );
  assert.ok(
    !(await loadProjectWithLatestSnapshot({
      projectId: a.id,
    }))!.snapshot.cards.some((c) => c.id === 'step-3'),
  );
});

after(async () => {
  const { getDb } = await import('@/core/workspace-lib/db-adapter');
  (await getDb()).$client.close();
});
