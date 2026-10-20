import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

test('scene canvases preserve the legacy snapshot, isolate commands and reject foreign or stale writes', async () => {
  process.env.BEATDESIGN_DATA_DIR = await mkdtemp(
    join(tmpdir(), 'beatdesign-series-'),
  );
  execFileSync(
    process.execPath,
    ['node_modules/drizzle-kit/bin.cjs', 'push', '--force'],
    {
      stdio: 'pipe',
      windowsHide: true,
      env: process.env,
    },
  );
  const { createProject, loadProjectWithLatestSnapshot } =
    await import('@/core/projects/projects');
  const { applyNarrativeCommand, getNarrative } = await import('./narrative');
  const { persistBeatDesignCommand } = await import('@/core/commands/persist');
  const { buildTextCard } = await import('@/core/beatcanvas/text-nodes');
  const a = await createProject({ name: 'Episode A' });
  const b = await createProject({ name: 'Other episode' });
  const before = await loadProjectWithLatestSnapshot({ projectId: a.id });
  await applyNarrativeCommand({
    projectId: a.id,
    commandId: 'scene',
    idempotencyKey: 'scene',
    expectedRevision: 0,
    command: { type: 'create_scene', sceneId: 'scene-a', name: 'Kitchen' },
  });
  await applyNarrativeCommand({
    projectId: a.id,
    commandId: 'document',
    idempotencyKey: 'document',
    expectedRevision: 1,
    command: {
      type: 'create_canvas',
      canvasId: 'canvas-a',
      sceneId: 'scene-a',
      name: 'Main',
    },
  });
  assert.equal((await getNarrative(a.id)).canvases.length, 2);
  const command = {
    type: 'canvas.apply' as const,
    operations: [
      {
        type: 'upsert_card' as const,
        card: buildTextCard({
          id: 'scene-note',
          name: 'Scene intention',
          textContent: 'A quiet entrance',
        }),
        frame: { x: 20, y: 20, w: 320, h: 180 },
      },
    ],
  };
  const write = {
    projectId: a.id,
    canvasId: 'canvas-a',
    origin: 'mcp' as const,
    commandId: 'note',
    idempotencyKey: 'note',
    expectedRevision: 1,
    command,
  };
  const result = await persistBeatDesignCommand(write);
  assert.equal(result.ok, true, JSON.stringify(result));
  const defaultAfter = await loadProjectWithLatestSnapshot({ projectId: a.id });
  assert.deepEqual(defaultAfter?.snapshot, before?.snapshot);
  assert.equal(defaultAfter?.snapshotVersion, before?.snapshotVersion);
  assert.equal(
    (
      await loadProjectWithLatestSnapshot({
        projectId: a.id,
        canvasId: 'canvas-a',
      })
    )?.snapshot.cards.length,
    1,
  );
  assert.deepEqual(await persistBeatDesignCommand(write), result);
  const collision = await persistBeatDesignCommand({
    ...write,
    canvasId: undefined,
  });
  assert.equal(collision.ok, false);
  const stale = await persistBeatDesignCommand({
    ...write,
    commandId: 'stale',
    idempotencyKey: 'stale',
  });
  assert.equal(stale.ok, false);
  await assert.rejects(() =>
    loadProjectWithLatestSnapshot({ projectId: b.id, canvasId: 'canvas-a' }),
  );
});

after(async () => {
  const { getDb } = await import('@/core/workspace-lib/db-adapter');
  (await getDb()).$client.close();
});
