import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  projectCanvasDocument,
  projectNarrativeState,
  projectScene,
  projectAssetScene,
  projectSceneClip,
  seriesEpisode,
  series,
} from '@/config/db/schema';
import { getDb } from '@/core/workspace-lib/db-adapter';
import { getActiveProject } from '@/core/projects/projects';
import { defaultCanvasId } from '@/core/projects/canvas-identity';
import { createEmptyProjectSnapshot } from '@/core/projects/project-snapshot';
import { persistScopedWrite } from '@/core/commands/scoped-write';
import {
  checkRevision,
  displayName,
  ScopeError,
  seriesLimits,
  stableId,
} from './contracts';

const narrativeCommand = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('create_scene'),
      sceneId: stableId,
      name: displayName,
      summary: z.string().max(2000).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('update_scene'),
      sceneId: stableId,
      name: displayName.optional(),
      summary: z.string().max(2000).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('set_scene_order'),
      sceneIds: z.array(stableId).max(200),
    })
    .strict(),
  z
    .object({
      type: z.literal('set_scene_archived'),
      sceneId: stableId,
      archived: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal('create_canvas'),
      canvasId: stableId,
      sceneId: stableId.nullable().optional(),
      name: displayName,
    })
    .strict(),
  z
    .object({
      type: z.literal('update_canvas'),
      canvasId: stableId,
      sceneId: stableId.nullable().optional(),
      name: displayName.optional(),
      orderKey: z.number().int().nonnegative().optional(),
      archived: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('assign_scene_assets'),
      sceneId: stableId,
      assetIds: z.array(stableId).max(500),
    })
    .strict(),
  z
    .object({
      type: z.literal('set_clip_scene'),
      sceneId: stableId.nullable(),
      clipId: stableId,
      timelineRevision: z.number().int().nonnegative(),
    })
    .strict(),
]);
export type NarrativeCommand = z.infer<typeof narrativeCommand>;

export async function getNarrative(projectId: string) {
  if (!(await getActiveProject({ projectId })))
    throw new ScopeError('NOT_FOUND', 'Project not found.');
  const db = await getDb();
  const [version] = await db
    .select()
    .from(projectNarrativeState)
    .where(eq(projectNarrativeState.projectId, projectId))
    .limit(1);
  const scenes: (typeof projectScene.$inferSelect)[] = await db
    .select()
    .from(projectScene)
    .where(eq(projectScene.projectId, projectId))
    .orderBy(asc(projectScene.orderKey), asc(projectScene.id));
  const rows: ReturnType<typeof defaultCanvasEntry>[] = await db
    .select({
      id: projectCanvasDocument.id,
      projectId: projectCanvasDocument.projectId,
      sceneId: projectCanvasDocument.sceneId,
      name: projectCanvasDocument.name,
      orderKey: projectCanvasDocument.orderKey,
      storageKind: projectCanvasDocument.storageKind,
      archivedAt: projectCanvasDocument.archivedAt,
    })
    .from(projectCanvasDocument)
    .where(eq(projectCanvasDocument.projectId, projectId))
    .orderBy(
      asc(projectCanvasDocument.orderKey),
      asc(projectCanvasDocument.id),
    );
  const canvases = rows.some((row) => row.id === defaultCanvasId(projectId))
    ? rows
    : [defaultCanvasEntry(projectId), ...rows];
  const [episode] = await db
    .select({
      episodeId: seriesEpisode.id,
      seriesId: series.id,
      name: series.name,
      label: seriesEpisode.label,
      archivedAt: series.archivedAt,
    })
    .from(seriesEpisode)
    .innerJoin(series, eq(series.id, seriesEpisode.seriesId))
    .where(eq(seriesEpisode.projectId, projectId))
    .limit(1);
  const clipScenes = await db
    .select()
    .from(projectSceneClip)
    .where(eq(projectSceneClip.projectId, projectId));
  return {
    projectId,
    revision: version?.revision ?? 0,
    scenes,
    canvases,
    episode: episode ?? null,
    clipScenes,
  };
}
export function defaultCanvasEntry(projectId: string) {
  return {
    id: defaultCanvasId(projectId),
    projectId,
    sceneId: null as string | null,
    name: 'Project canvas',
    orderKey: 0,
    storageKind: 'legacy_default',
    archivedAt: null as number | null,
  };
}
export async function requireScene(
  projectId: string,
  sceneId: string,
  allowArchived = false,
) {
  const db = await getDb();
  const [scene] = await db
    .select()
    .from(projectScene)
    .where(
      and(eq(projectScene.id, sceneId), eq(projectScene.projectId, projectId)),
    )
    .limit(1);
  if (!scene || (!allowArchived && scene.archivedAt))
    throw new ScopeError(
      'SCOPE_MISMATCH',
      'Scene is missing or outside this project.',
    );
  return scene;
}
export async function getCanvasEntry(
  projectId: string,
  canvasId: string,
  allowArchived = false,
) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(projectCanvasDocument)
    .where(
      and(
        eq(projectCanvasDocument.id, canvasId),
        eq(projectCanvasDocument.projectId, projectId),
      ),
    )
    .limit(1);
  if (!row && canvasId === defaultCanvasId(projectId))
    return {
      ...defaultCanvasEntry(projectId),
      documentJson: null,
      version: null,
    };
  if (!row || (!allowArchived && row.archivedAt))
    throw new ScopeError(
      'SCOPE_MISMATCH',
      'Canvas is missing, archived, or outside this project.',
    );
  if (row.sceneId && row.storageKind !== 'legacy_default')
    await requireScene(projectId, row.sceneId, allowArchived);
  return row;
}
export async function bumpNarrative(projectId: string, expected: number) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(projectNarrativeState)
    .where(eq(projectNarrativeState.projectId, projectId))
    .limit(1);
  checkRevision(row?.revision ?? 0, expected);
  await db
    .insert(projectNarrativeState)
    .values({ projectId, revision: expected + 1 })
    .onConflictDoUpdate({
      target: projectNarrativeState.projectId,
      set: { revision: expected + 1 },
    });
}
export async function applyNarrativeCommand(input: {
  projectId: string;
  commandId: string;
  idempotencyKey: string;
  expectedRevision: number;
  command: NarrativeCommand;
  origin?: 'ui' | 'mcp';
}) {
  const command = narrativeCommand.parse(input.command);
  return persistScopedWrite(
    { ...input, scope: 'project', scopeId: input.projectId, command },
    async () => {
      const state = await getNarrative(input.projectId);
      checkRevision(state.revision, input.expectedRevision);
      const db = await getDb();
      const projectId = input.projectId;
      switch (command.type) {
        case 'create_scene': {
          if (state.scenes.length >= seriesLimits.scenes)
            throw new ScopeError(
              'CAPACITY_EXCEEDED',
              'Project scene limit reached.',
            );
          await db.insert(projectScene).values({
            id: command.sceneId,
            projectId,
            name: command.name,
            summary: command.summary ?? '',
            orderKey: state.scenes.length,
            archivedAt: null,
          });
          break;
        }
        case 'update_scene':
          await requireScene(projectId, command.sceneId);
          await db
            .update(projectScene)
            .set({
              ...(command.name !== undefined ? { name: command.name } : {}),
              ...(command.summary !== undefined
                ? { summary: command.summary }
                : {}),
            })
            .where(eq(projectScene.id, command.sceneId));
          break;
        case 'set_scene_order': {
          const ids = state.scenes.map((s) => s.id);
          if (
            new Set(command.sceneIds).size !== ids.length ||
            command.sceneIds.length !== ids.length ||
            command.sceneIds.some((id) => !ids.includes(id))
          )
            throw new ScopeError(
              'INVALID_COMMAND',
              'Provide every scene exactly once.',
            );
          for (const [i, id] of command.sceneIds.entries())
            await db
              .update(projectScene)
              .set({ orderKey: i })
              .where(eq(projectScene.id, id));
          break;
        }
        case 'set_scene_archived':
          await requireScene(projectId, command.sceneId, true);
          await db
            .update(projectScene)
            .set({ archivedAt: command.archived ? Date.now() : null })
            .where(eq(projectScene.id, command.sceneId));
          break;
        case 'create_canvas': {
          if (command.canvasId.startsWith('default:'))
            throw new ScopeError(
              'INVALID_COMMAND',
              'Default Canvas IDs are reserved.',
            );
          if (command.sceneId) await requireScene(projectId, command.sceneId);
          if (
            state.canvases.length >= seriesLimits.canvases ||
            (command.sceneId &&
              state.canvases.filter((c) => c.sceneId === command.sceneId)
                .length >= seriesLimits.canvasesPerScene)
          )
            throw new ScopeError('CAPACITY_EXCEEDED', 'Canvas limit reached.');
          await db.insert(projectCanvasDocument).values({
            id: command.canvasId,
            projectId,
            sceneId: command.sceneId ?? null,
            name: command.name,
            orderKey: state.canvases.length,
            storageKind: 'document',
            documentJson: createEmptyProjectSnapshot(),
            version: 1,
            archivedAt: null,
          });
          break;
        }
        case 'update_canvas': {
          const entry = await getCanvasEntry(projectId, command.canvasId, true);
          if (command.sceneId) await requireScene(projectId, command.sceneId);
          if (command.archived && entry.storageKind === 'legacy_default')
            throw new ScopeError(
              'INVALID_COMMAND',
              'The project Canvas cannot be archived.',
            );
          if (
            command.sceneId &&
            command.sceneId !== entry.sceneId &&
            state.canvases.filter((c) => c.sceneId === command.sceneId)
              .length >= seriesLimits.canvasesPerScene
          )
            throw new ScopeError(
              'CAPACITY_EXCEEDED',
              'Scene Canvas limit reached.',
            );
          await db
            .insert(projectCanvasDocument)
            .values(entry)
            .onConflictDoNothing();
          await db
            .update(projectCanvasDocument)
            .set({
              ...(command.name !== undefined ? { name: command.name } : {}),
              ...(command.sceneId !== undefined
                ? { sceneId: command.sceneId }
                : {}),
              ...(command.orderKey !== undefined
                ? { orderKey: command.orderKey }
                : {}),
              ...(command.archived !== undefined
                ? { archivedAt: command.archived ? Date.now() : null }
                : {}),
            })
            .where(eq(projectCanvasDocument.id, entry.id));
          break;
        }
        case 'assign_scene_assets': {
          await requireScene(projectId, command.sceneId);
          const { getProjectAssetById } =
            await import('@/core/workspace-lib/assets/user-assets');
          for (const assetId of new Set(command.assetIds)) {
            if (!(await getProjectAssetById({ projectId, assetId })))
              throw new ScopeError(
                'SCOPE_MISMATCH',
                'Asset must belong to this project.',
              );
            await db
              .insert(projectAssetScene)
              .values({
                id: `${command.sceneId}:${assetId}`,
                projectId,
                sceneId: command.sceneId,
                assetId,
                provenance: 'explicit',
              })
              .onConflictDoNothing();
          }
          break;
        }
        case 'set_clip_scene': {
          if (command.sceneId) await requireScene(projectId, command.sceneId);
          const { loadProjectTimeline } =
            await import('@/core/editor/timeline-state');
          const timeline = await loadProjectTimeline(projectId);
          checkRevision(timeline?.version ?? 0, command.timelineRevision);
          if (
            !timeline?.document.tracks.some((t) =>
              t.clips.some((c) => c.id === command.clipId),
            )
          )
            throw new ScopeError('NOT_FOUND', 'Timeline clip not found.');
          await db
            .delete(projectSceneClip)
            .where(
              and(
                eq(projectSceneClip.projectId, projectId),
                eq(projectSceneClip.clipId, command.clipId),
              ),
            );
          if (command.sceneId)
            await db.insert(projectSceneClip).values({
              id: `${projectId}:${command.clipId}`,
              projectId,
              sceneId: command.sceneId,
              clipId: command.clipId,
            });
          break;
        }
      }
      await bumpNarrative(projectId, state.revision);
      return getNarrative(projectId);
    },
  );
}
