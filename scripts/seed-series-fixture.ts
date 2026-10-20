import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  createProject,
  saveProjectSnapshot,
  loadProjectWithLatestSnapshot,
} from '@/core/projects/projects';
import { createEmptyProjectSnapshot } from '@/core/projects/project-snapshot';
import { buildTextCard } from '@/core/beatcanvas/text-nodes';
import { getDb } from '@/core/workspace-lib/db-adapter';
import {
  projectScene,
  projectCanvasDocument,
  projectNarrativeState,
} from '@/config/db/schema';
import { applySeriesCommand, getSeries } from '@/core/series/service';
import { getNarrative } from '@/core/series/narrative';
import { applySharedCommand } from '@/core/series/shared-assets';
import { persistBeatDesignCommand } from '@/core/commands/persist';
import { persistLocalProjectAsset } from '@/core/projects/local-project-assets';
import {
  recordUserAsset,
  linkProjectAsset,
} from '@/core/workspace-lib/assets/user-assets';
import type { CanvasCard } from '@/core/beatcanvas/canvas-types';

// Deliberately requires a new isolated directory. No production import or provider.
const configured = process.env.BEATDESIGN_DATA_DIR?.trim();
if (!configured || resolve(configured) === resolve('data'))
  throw new Error('Explicit isolated fixture data directory required.');
const directory = resolve(configured);
await mkdir(directory, { recursive: true });
const seriesId = 'synthetic-series-002';
if (await getSeries(seriesId))
  throw new Error('Series fixture already exists; do not duplicate it.');
const db = await getDb();
async function seriesWrite(command: any) {
  const id = randomUUID();
  return applySeriesCommand({
    seriesId,
    commandId: id,
    idempotencyKey: id,
    expectedRevision: (await getSeries(seriesId))?.revision ?? 0,
    command,
  });
}
await seriesWrite({
  type: 'create',
  name: 'Series 002 · synthetic 12 episodes',
  description:
    'Isolated test media, 240 scenes and 6,000 cards. No film or model jobs.',
});
const episodes: {
  projectId: string;
  scenes: { id: string; canvasId: string; cardIds: string[] }[];
}[] = [];
let totalCards = 0;
for (let ep = 0; ep < 12; ep++) {
  const project = await createProject({
    name: `Series 002 · Episode ${String(ep + 1).padStart(2, '0')}`,
  });
  await seriesWrite({
    type: 'attach_episode',
    episodeId: `synthetic-episode-${ep}`,
    projectId: project.id,
    narrativeRevision: 0,
  });
  const scenes: (typeof episodes)[number]['scenes'] = [];
  for (let sc = 0; sc < 20; sc++) {
    const id = `synthetic-scene-${ep}-${sc}`,
      canvasId = `synthetic-canvas-${ep}-${sc}`;
    const count = ep === 0 && sc < 6 ? 100 : ep === 0 && sc === 6 ? 19 : 23;
    const cards = Array.from({ length: count }, (_, i) =>
      buildTextCard({
        id: `e${ep}-s${sc}-note-${i}`,
        name: `Shot ${i + 1}`,
        textContent:
          'Synthetic scene planning. No inference or production media.',
      }),
    );
    const document = {
      ...createEmptyProjectSnapshot(),
      cards,
      frames: Object.fromEntries(
        cards.map((c, i) => [
          c.id,
          { x: (i % 5) * 380, y: Math.floor(i / 5) * 270, w: 320, h: 180 },
        ]),
      ),
      camera: { x: 40, y: 40, z: 0.6 },
    };
    await db.insert(projectScene).values({
      id,
      projectId: project.id,
      name: `Scene ${String(sc + 1).padStart(2, '0')}`,
      summary: 'Synthetic scene; independent Canvas document',
      orderKey: sc,
      archivedAt: null,
    });
    await db.insert(projectCanvasDocument).values({
      id: canvasId,
      projectId: project.id,
      sceneId: id,
      name: 'Main board',
      orderKey: sc,
      storageKind: 'document',
      documentJson: document,
      version: 1,
      archivedAt: null,
    });
    totalCards += cards.length;
    scenes.push({ id, canvasId, cardIds: cards.map((c) => c.id) });
  }
  await db
    .insert(projectNarrativeState)
    .values({ projectId: project.id, revision: 1 })
    .onConflictDoNothing();
  episodes.push({ projectId: project.id, scenes });
}
if (totalCards !== 5978) throw new Error(`Unexpected card count ${totalCards}`);
const owner = episodes[0].projectId;
const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAIAAAC0SDtlAAAAE0lEQVR42mPQ96slCTGMahgUGgD8sYyh+gdn4AAAAABJRU5ErkJggg==',
  'base64',
);
const assetIds: string[] = [],
  hashes: Record<string, string> = {};
for (let i = 0; i < 2000; i++) {
  const id = `series-image-${String(i).padStart(4, '0')}`;
  const file = await persistLocalProjectAsset({
    projectId: owner,
    assetId: id,
    filename: `Series-image-${String(i).padStart(4, '0')}.png`,
    mimeType: 'image/png',
    bytes: pixel,
  });
  await recordUserAsset({
    id,
    type: 'image',
    source: 'upload',
    bucket: 'local-project-assets',
    objectKey: file.objectKey,
    publicUrl: file.publicUrl,
    filename: file.filename,
    mimeType: 'image/png',
    sizeBytes: file.sizeBytes,
    sha256: file.sha256,
    storageProvider: 'local',
    originProjectId: owner,
    metadata: { syntheticFixture: true },
    width: 16,
    height: 9,
  });
  await linkProjectAsset({ projectId: owner, assetId: id, role: 'upload' });
  assetIds.push(id);
  hashes[id] = file.sha256;
}
// Put 20 shared-version consumers in the default documents; 6,000 total cards, including these 22 auxiliary cards.
async function sharedWrite(command: any) {
  const id = randomUUID();
  return applySharedCommand({
    seriesId,
    commandId: id,
    idempotencyKey: id,
    expectedRevision: (await getSeries(seriesId))!.revision,
    command,
  });
}
await sharedWrite({
  type: 'publish_element',
  elementId: 'synthetic-hero',
  versionId: 'synthetic-hero-v1',
  name: 'Shared hero · synthetic',
  kind: 'character',
  sourceProjectId: owner,
  assetId: assetIds[0],
});
for (const episode of episodes.slice(0, 2)) {
  const loaded = (await loadProjectWithLatestSnapshot({
    projectId: episode.projectId,
  }))!;
  const cards = Array.from(
    { length: 10 },
    (_, i) =>
      ({
        ...buildTextCard({
          id: `reference-step-${i}`,
          name: `Reference consumer ${i + 1}`,
        }),
        kind: 'generation',
        type: 'image',
        modelId: 'local-flux3-klein',
      }) as CanvasCard,
  );
  await saveProjectSnapshot({
    projectId: episode.projectId,
    document: {
      ...loaded.snapshot,
      cards,
      frames: Object.fromEntries(
        cards.map((c, i) => [
          c.id,
          { x: (i % 3) * 420, y: Math.floor(i / 3) * 300, w: 320, h: 220 },
        ]),
      ),
    },
    baseVersion: loaded.snapshotVersion,
  });
  const id = randomUUID();
  const result = await persistBeatDesignCommand({
    projectId: episode.projectId,
    origin: 'mcp',
    commandId: id,
    idempotencyKey: id,
    expectedRevision: 2,
    command: {
      type: 'canvas.apply',
      operations: cards.map((c, i) => ({
        type: 'bind_element',
        bindingId: `hero-use-${i}`,
        scope: 'series',
        ownerId: seriesId,
        elementId: 'synthetic-hero',
        versionId: 'synthetic-hero-v1',
        assetId: assetIds[0],
        consumerCardId: c.id,
        referenceCardId: 'hero-reference-v1',
        order: 0,
        role: 'subject',
      })),
    },
  });
  if (!result.ok) throw new Error(JSON.stringify(result));
}
await sharedWrite({
  type: 'add_version',
  elementId: 'synthetic-hero',
  versionId: 'synthetic-hero-v2',
  sourceProjectId: owner,
  assetId: assetIds[1],
});
await sharedWrite({
  type: 'set_current',
  elementId: 'synthetic-hero',
  observedCurrentVersionId: 'synthetic-hero-v1',
  versionId: 'synthetic-hero-v2',
});
const manifest = {
  syntheticOnly: true,
  seriesId,
  episodes,
  sceneCards: totalCards,
  totalCards: totalCards + 22,
  auxiliaryDefaultCards: 22,
  assets: 2000,
  assetIds,
  hashes,
  providerSubmissions: 0,
  uploads: 0,
};
await writeFile(
  resolve(directory, 'series-fixture.json'),
  JSON.stringify(manifest, null, 2),
);
console.log(
  JSON.stringify({
    seriesId,
    episodes: episodes.length,
    scenes: 240,
    sceneCards: totalCards,
    totalCards: totalCards + 22,
    assets: 2000,
    owner,
  }),
);
