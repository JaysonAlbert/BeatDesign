import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  createProject,
  loadProjects,
  loadProjectWithLatestSnapshot,
} from '@/core/projects/projects';
import { persistLocalProjectAsset } from '@/core/projects/local-project-assets';
import {
  recordUserAsset,
  linkProjectAsset,
} from '@/core/workspace-lib/assets/user-assets';
import { persistBeatDesignCommand } from '@/core/commands/persist';
import { canvasCardSchema } from '@/core/commands/schema';
import {
  applyNarrativeCommand,
  getNarrative,
  type NarrativeCommand,
} from '@/core/series/narrative';
import type { CanvasOperation } from '@/core/commands/canvas-commands';

// An explicit isolated directory and synthetic images are mandatory; no provider calls.
const data = process.env.BEATDESIGN_DATA_DIR;
if (!data || resolve(data) === resolve('data'))
  throw new Error('Explicit isolated fixture directory required');
const manifest = resolve(data, 'canvas-redesign.json');
try {
  await readFile(manifest);
  throw new Error('Fixture already exists');
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
const project =
  (await loadProjects({ limit: 200 })).find(
    (p) => p.name === '清晨的房间 · 界面演示'
  ) ?? (await createProject({ name: '清晨的房间 · 界面演示' }));
async function narrative(command: NarrativeCommand) {
  const state = await getNarrative(project.id);
  if (
    command.type === 'create_scene' &&
    state.scenes.some((s) => s.id === command.sceneId)
  )
    return;
  if (
    command.type === 'create_canvas' &&
    state.canvases.some((c) => c.id === command.canvasId)
  )
    return;
  const id = randomUUID();
  return applyNarrativeCommand({
    projectId: project.id,
    commandId: id,
    idempotencyKey: id,
    expectedRevision: (await getNarrative(project.id)).revision,
    command,
  });
}
const scenes = ['卧室 · 清晨', '穿衣角 · 挑选', '洗衣角 · 发现'];
for (const [i, name] of scenes.entries()) {
  await narrative({
    type: 'create_scene',
    sceneId: `redesign-scene-${i}`,
    name,
  });
  await narrative({
    type: 'create_canvas',
    canvasId: `redesign-canvas-${i}`,
    sceneId: `redesign-scene-${i}`,
    name: '主画布',
  });
}
await narrative({
  type: 'create_canvas',
  canvasId: 'redesign-reference',
  sceneId: 'redesign-scene-1',
  name: '构图参考',
});
await narrative({
  type: 'create_scene',
  sceneId: 'redesign-empty',
  name: '待整理 · 空场次',
});
await narrative({
  type: 'create_canvas',
  canvasId: 'redesign-unassigned',
  sceneId: null,
  name: '素材暂存',
});
const media = [];
for (let i = 0; i < 3; i++) {
  const assetId = `${project.id}-demo-${i}`;
  const saved = await persistLocalProjectAsset({
    projectId: project.id,
    assetId,
    filename: `synthetic-room-${i}.png`,
    mimeType: 'image/png',
    bytes: await readFile(
      resolve('data/redesign-fixture-media', `room-${i}.png`)
    ),
  });
  await recordUserAsset({
    id: assetId,
    type: 'image',
    source: 'upload',
    bucket: 'local-project-assets',
    objectKey: saved.objectKey,
    publicUrl: saved.publicUrl,
    filename: saved.filename,
    mimeType: 'image/png',
    sizeBytes: saved.sizeBytes,
    sha256: saved.sha256,
    storageProvider: 'local',
    originProjectId: project.id,
    width: 960,
    height: 540,
    metadata: { syntheticFixture: true },
  });
  await linkProjectAsset({ projectId: project.id, assetId, role: 'upload' });
  media.push({ assetId, url: saved.publicUrl });
}
const cards = [
  canvasCardSchema.parse({
    id: 'room-reference',
    kind: 'asset',
    type: 'image',
    name: '房间构图 · 演示参考',
    ...media[0],
  }),
  canvasCardSchema.parse({
    id: 'shot-image',
    kind: 'generation',
    type: 'image',
    name: '清晨的房间',
    modelId: 'gpt-image-2.5-flare',
    prompt: '晨光穿过窗户，落在安静的房间里。保持构图和柔和色调。',
    referenceCardIds: ['room-reference'],
    pinnedOutputId: 'result-2',
  }),
  canvasCardSchema.parse({
    id: 'shot-video',
    kind: 'generation',
    type: 'video',
    name: '镜头 01 · 清晨',
    modelId: 'seedance-2.0',
    prompt: '镜头缓缓向前，窗帘被晨风轻轻吹动。连续自然的动作，保持房间布局。',
    referenceCardIds: ['shot-image'],
    duration: 10,
  }),
];
for (let i = 0; i < 3; i++)
  cards.push(
    canvasCardSchema.parse({
      ...cards[1],
      id: `result-${i}`,
      kind: 'output',
      name: `构图版本 ${i + 1}`,
      ...media[i],
      sourceConfigCardId: 'shot-image',
      generationRunId: `synthetic-${i}`,
      status: 'succeeded',
      generationSnapshot: {
        ...cards[1],
        capturedAt: `2026-10-23T00:00:0${i}.000Z`,
      },
    })
  );
const operations: CanvasOperation[] = cards.map((card, i) => ({
  type: 'upsert_card',
  card,
  frame: { x: i === 0 ? 90 : i === 2 ? 880 : 480, y: 180, w: 320, h: 180 },
}));
operations.push(
  {
    type: 'create_group',
    groupId: 'shot-group',
    name: '镜头 01 · 清晨',
    role: 'shot',
    memberCardIds: cards.map((c) => c.id),
    collapsed: false,
    resultCardId: 'shot-video',
    expandedFrame: { x: 55, y: 100, w: 1190, h: 610 },
    summaryFrame: { x: 55, y: 100, w: 340, h: 210 },
  },
  { type: 'set_camera', camera: { x: 25, y: 20, z: 0.9 } }
);
const id = randomUUID();
const result = await persistBeatDesignCommand({
  projectId: project.id,
  canvasId: 'redesign-canvas-0',
  origin: 'system',
  commandId: id,
  idempotencyKey: id,
  expectedRevision: 1,
  command: { type: 'canvas.apply', operations },
});
if (!result.ok) throw new Error(result.message);
await writeFile(
  manifest,
  JSON.stringify(
    {
      projectId: project.id,
      canvasId: 'redesign-canvas-0',
      url: `http://127.0.0.1:3060/zh/canvas/${project.id}?canvasId=redesign-canvas-0&sceneId=redesign-scene-0`,
      synthetic: true,
    },
    null,
    2
  )
);
console.log(await readFile(manifest, 'utf8'));
