import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildTextCard } from '@/core/beatcanvas/text-nodes';
import type { CanvasCard } from '@/core/beatcanvas/canvas-types';

test('scoped asset queries deduplicate 2000 assets, page consistently and derive scene media without loading snapshots', async () => {
  process.env.BEATDESIGN_DATA_DIR = await mkdtemp(
    join(tmpdir(), 'beatdesign-series-assets-'),
  );
  execFileSync(
    process.execPath,
    ['node_modules/drizzle-kit/bin.cjs', 'push', '--force'],
    { stdio: 'pipe', windowsHide: true, env: process.env },
  );
  const { createProject, saveProjectSnapshot } =
    await import('@/core/projects/projects');
  const { getDb } = await import('@/core/workspace-lib/db-adapter');
  const { userAsset, projectAssetMembership } =
    await import('@/config/db/schema');
  const { applyNarrativeCommand } = await import('./narrative');
  const { queryScopedAssets } = await import('./asset-query');
  const p = await createProject({ name: 'Asset board fixture' });
  const db = await getDb();
  const ids = Array.from(
    { length: 2000 },
    (_, i) => `asset-${String(i).padStart(4, '0')}`,
  );
  for (let offset = 0; offset < ids.length; offset += 250) {
    const batch = ids.slice(offset, offset + 250);
    await db.insert(userAsset).values(
      batch.map((id) => ({
        id,
        type: 'image',
        source: 'upload',
        bucket: 'fixture',
        objectKey: id,
        publicUrl: `/fixture/${id}`,
        filename: `${id}.png`,
        originProjectId: p.id,
      })),
    );
    await db.insert(projectAssetMembership).values(
      batch.map((id) => ({
        id: `member-${id}`,
        projectId: p.id,
        assetId: id,
        category: 'upload',
      })),
    );
  }
  await db.insert(projectAssetMembership).values({
    id: 'duplicate-category',
    projectId: p.id,
    assetId: ids[0],
    category: 'reference',
  });
  await applyNarrativeCommand({
    projectId: p.id,
    commandId: 'scene',
    idempotencyKey: 'scene',
    expectedRevision: 0,
    command: { type: 'create_scene', sceneId: 'scene', name: 'Scene' },
  });
  await applyNarrativeCommand({
    projectId: p.id,
    commandId: 'canvas',
    idempotencyKey: 'canvas',
    expectedRevision: 1,
    command: {
      type: 'create_canvas',
      canvasId: 'scene-canvas',
      sceneId: 'scene',
      name: 'Scene Canvas',
    },
  });
  await applyNarrativeCommand({
    projectId: p.id,
    commandId: 'assign',
    idempotencyKey: 'assign',
    expectedRevision: 2,
    command: {
      type: 'assign_scene_assets',
      sceneId: 'scene',
      assetIds: ids.slice(0, 50),
    },
  });
  const cards = ids.slice(50, 100).map(
    (id) =>
      ({
        ...buildTextCard({ id: `card-${id}`, name: id }),
        kind: 'asset',
        type: 'image',
        assetId: id,
        url: `/fixture/${id}`,
      }) as CanvasCard,
  );
  await saveProjectSnapshot({
    projectId: p.id,
    canvasId: 'scene-canvas',
    baseVersion: 1,
    document: { version: 4, cards, frames: {} },
  });
  const scene = await queryScopedAssets({
    projectId: p.id,
    scope: 'scene',
    sceneId: 'scene',
  });
  assert.equal(scene.total, 100);
  assert.equal(scene.assets.length, 100);
  const first = await queryScopedAssets({ projectId: p.id, scope: 'episode' });
  assert.equal(first.total, 2000);
  const found = new Set(first.assets.map((a) => a.id));
  let cursor = first.nextCursor;
  while (cursor) {
    const page = await queryScopedAssets({
      projectId: p.id,
      scope: 'episode',
      cursor,
    });
    for (const asset of page.assets) {
      assert.ok(!found.has(asset.id));
      found.add(asset.id);
    }
    cursor = page.nextCursor;
  }
  assert.equal(found.size, 2000);
  assert.ok(found.has(ids[1800]));
  assert.equal(
    (
      await queryScopedAssets({
        projectId: p.id,
        scope: 'episode',
        usage: 'unassigned',
      })
    ).total,
    1900,
  );
  assert.equal(
    (
      await queryScopedAssets({
        projectId: p.id,
        scope: 'episode',
        query: ids[1000],
      })
    ).total,
    1,
  );
  await db.insert(projectAssetMembership).values({
    id: 'new-category',
    projectId: p.id,
    assetId: ids[1],
    category: 'reference',
  });
  await assert.rejects(
    () =>
      queryScopedAssets({
        projectId: p.id,
        scope: 'episode',
        cursor: first.nextCursor!,
      }),
    /Restart pagination|changed/i,
  );
  await assert.rejects(
    () =>
      queryScopedAssets({
        projectId: p.id,
        scope: 'scene',
        sceneId: 'foreign-scene',
      }),
    /Scene is missing|outside/i,
  );
});

after(async () => {
  const { getDb } = await import('@/core/workspace-lib/db-adapter');
  (await getDb()).$client.close();
});
