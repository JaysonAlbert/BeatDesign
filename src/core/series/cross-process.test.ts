import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';

function worker(code: string) {
  return new Promise<any>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '-e', code],
      {
        env: process.env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (c) => (stdout += c));
    child.stderr.on('data', (c) => (stderr += c));
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(stderr || 'Worker timed out'));
    }, 30000);
    child.once('error', reject);
    child.once('exit', (status) => {
      clearTimeout(timer);
      status === 0
        ? resolve(JSON.parse(stdout.trim().split('\n').at(-1)!))
        : reject(new Error(stderr));
    });
  });
}
test('two processes upgrade a legacy database without rewriting its snapshot, then race narrative CAS', async () => {
  const root = await mkdtemp(join(tmpdir(), 'beatdesign-series-process-'));
  const path = join(root, 'legacy.db');
  const client = createClient({ url: `file:${path}` });
  await client.execute(
    'CREATE TABLE project(id TEXT PRIMARY KEY,cover_asset_id TEXT)',
  );
  await client.execute("INSERT INTO project VALUES('old','manual-cover')");
  await client.execute(
    'CREATE TABLE project_canvas_state(project_id TEXT PRIMARY KEY,document_json TEXT,version INTEGER)',
  );
  const legacy =
    '{"version":4,"cards":[],"frames":{},"camera":{"x":91,"y":32,"z":0.8}}';
  await client.execute({
    sql: 'INSERT INTO project_canvas_state VALUES(?,?,?)',
    args: ['old', legacy, 7],
  });
  const upgrade = `import {createClient} from '@libsql/client'; import {configureLocalSqlite} from './src/core/db/sqlite.ts'; const c=createClient({url:${JSON.stringify(`file:${path}`)}}); await configureLocalSqlite(c); c.close(); console.log(JSON.stringify({ok:true}));`;
  assert.deepEqual(await Promise.all([worker(upgrade), worker(upgrade)]), [
    { ok: true },
    { ok: true },
  ]);
  assert.equal(
    (await client.execute('SELECT document_json FROM project_canvas_state'))
      .rows[0].document_json,
    legacy,
  );
  assert.equal(
    (await client.execute('SELECT cover_asset_id FROM project')).rows[0]
      .cover_asset_id,
    'manual-cover',
  );
  client.close();
  process.env.BEATDESIGN_DATA_DIR = join(root, 'workspace');
  await mkdir(process.env.BEATDESIGN_DATA_DIR, { recursive: true });
  execFileSync(
    process.execPath,
    ['node_modules/drizzle-kit/bin.cjs', 'push', '--force'],
    { env: process.env, windowsHide: true, stdio: 'pipe' },
  );
  const { createProject } = await import('@/core/projects/projects');
  const { getNarrative } = await import('./narrative');
  const project = await createProject({ name: 'Cross-process episode' });
  const source = (suffix: string) =>
    `import {applyNarrativeCommand} from './src/core/series/narrative.ts'; try { await applyNarrativeCommand(${JSON.stringify({ projectId: project.id, commandId: `race-${suffix}`, idempotencyKey: `race-${suffix}`, expectedRevision: 0, command: { type: 'create_scene', sceneId: `race-scene-${suffix}`, name: 'Same scene name' } })}); console.log(JSON.stringify({ok:true})); } catch(e) { console.log(JSON.stringify({ok:false,code:e.code})); } process.exit(0);`;
  const results = await Promise.all([worker(source('a')), worker(source('b'))]);
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal((await getNarrative(project.id)).scenes.length, 1);
  assert.equal(results.find((r) => !r.ok)?.code, 'REVISION_CONFLICT');

  const { applySeriesCommand, getSeries } = await import('./service');
  const { applySharedCommand, previewSharedArchive, getSharedLibrary } =
    await import('./shared-assets');
  const { recordUserAsset, linkProjectAsset } =
    await import('@/core/workspace-lib/assets/user-assets');
  const { loadProjectWithLatestSnapshot, saveProjectSnapshot } =
    await import('@/core/projects/projects');
  const { buildTextCard } = await import('@/core/beatcanvas/text-nodes');
  const seriesId = 'racing-series';
  await applySeriesCommand({
    seriesId,
    commandId: 'series',
    idempotencyKey: 'series',
    expectedRevision: 0,
    command: { type: 'create', name: 'Archive versus bind' },
  });
  await applySeriesCommand({
    seriesId,
    commandId: 'attach',
    idempotencyKey: 'attach',
    expectedRevision: 1,
    command: {
      type: 'attach_episode',
      episodeId: 'episode',
      projectId: project.id,
      narrativeRevision: 1,
    },
  });
  await recordUserAsset({
    id: 'race-image',
    type: 'image',
    source: 'upload',
    bucket: 'fixture',
    objectKey: 'race-image',
    publicUrl: '/synthetic/race.png',
  });
  await linkProjectAsset({
    projectId: project.id,
    assetId: 'race-image',
    role: 'upload',
  });
  await applySharedCommand({
    seriesId,
    commandId: 'publish',
    idempotencyKey: 'publish',
    expectedRevision: 2,
    command: {
      type: 'publish_element',
      elementId: 'race-element',
      versionId: 'race-v1',
      name: 'Race reference',
      kind: 'character',
      sourceProjectId: project.id,
      assetId: 'race-image',
    },
  });
  const loaded = (await loadProjectWithLatestSnapshot({
    projectId: project.id,
  }))!;
  await saveProjectSnapshot({
    projectId: project.id,
    baseVersion: loaded.snapshotVersion,
    document: {
      ...loaded.snapshot,
      cards: [
        {
          ...buildTextCard({ id: 'race-step', name: 'Race step' }),
          kind: 'generation',
          type: 'image',
          modelId: 'local-flux3-klein',
        } as any,
      ],
    },
  });
  const preview = await previewSharedArchive({
    seriesId,
    elementId: 'race-element',
  });
  const archiveRequest = {
    seriesId,
    commandId: 'archive-race',
    idempotencyKey: 'archive-race',
    expectedRevision: (await getSeries(seriesId))!.revision,
    command: {
      type: 'archive_element',
      elementId: 'race-element',
      archived: true,
      previewToken: preview.previewToken,
    },
  };
  const bindingRequest = {
    projectId: project.id,
    origin: 'mcp',
    commandId: 'bind-race',
    idempotencyKey: 'bind-race',
    expectedRevision: 2,
    command: {
      type: 'canvas.apply',
      operations: [
        {
          type: 'bind_element',
          bindingId: 'race-binding',
          scope: 'series',
          ownerId: seriesId,
          elementId: 'race-element',
          versionId: 'race-v1',
          assetId: 'race-image',
          consumerCardId: 'race-step',
          referenceCardId: 'race-reference',
          role: 'subject',
          order: 0,
        },
      ],
    },
  };
  const wrap = (module: string, method: string, request: unknown) =>
    `import {${method}} from '${module}'; try { const result = await ${method}(${JSON.stringify(request)}); console.log(JSON.stringify({ok:result.ok !== false})); } catch(e) {console.log(JSON.stringify({ok:false}));} process.exit(0);`;
  const outcomes = await Promise.all([
    worker(
      wrap(
        './src/core/series/shared-assets.ts',
        'applySharedCommand',
        archiveRequest,
      ),
    ),
    worker(
      wrap(
        './src/core/commands/persist.ts',
        'persistBeatDesignCommand',
        bindingRequest,
      ),
    ),
  ]);
  assert.equal(outcomes.filter((r) => r.ok).length, 1);
  const element = (await getSharedLibrary(seriesId)).elements[0];
  assert.equal(element.consumers.length, element.archivedAt ? 0 : 1);
});

after(async () => {
  const { getDb } = await import('@/core/workspace-lib/db-adapter');
  (await getDb()).$client.close();
});
