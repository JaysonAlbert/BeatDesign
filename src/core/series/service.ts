import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { project, series, seriesEpisode } from '@/config/db/schema';
import { getDb } from '@/core/workspace-lib/db-adapter';
import { persistScopedWrite } from '@/core/commands/scoped-write';
import {
  checkRevision,
  displayName,
  ScopeError,
  seriesLimits,
  stableId,
} from './contracts';
import { bumpNarrative, getNarrative } from './narrative';

export async function listSeries(includeArchived = false) {
  const db = await getDb();
  const rows: (typeof series.$inferSelect)[] = await db
    .select()
    .from(series)
    .orderBy(desc(series.updatedAt))
    .limit(500);
  return includeArchived ? rows : rows.filter((row) => row.archivedAt === null);
}
export async function getSeries(seriesId: string) {
  const db = await getDb();
  const [row]: (typeof series.$inferSelect)[] = await db
    .select()
    .from(series)
    .where(eq(series.id, seriesId))
    .limit(1);
  if (!row) return null;
  const episodes: {
    id: string;
    projectId: string;
    label: string | null;
    name: string;
    orderKey: number;
    status: string;
  }[] = await db
    .select({
      id: seriesEpisode.id,
      projectId: seriesEpisode.projectId,
      label: seriesEpisode.label,
      name: project.name,
      orderKey: seriesEpisode.orderKey,
      status: project.status,
    })
    .from(seriesEpisode)
    .innerJoin(project, eq(project.id, seriesEpisode.projectId))
    .where(eq(seriesEpisode.seriesId, seriesId))
    .orderBy(asc(seriesEpisode.orderKey), asc(seriesEpisode.id));
  return { ...row, episodes };
}
export async function requireEpisode(
  seriesId: string,
  projectId: string,
  allowArchived = false,
) {
  const state = await getSeries(seriesId);
  if (
    !state ||
    (!allowArchived && state.archivedAt) ||
    !state.episodes.some((e) => e.projectId === projectId)
  )
    throw new ScopeError(
      'SCOPE_MISMATCH',
      'Project does not belong to this active Series.',
    );
  return state;
}
const commandSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('create'),
      name: displayName,
      description: z.string().max(1000).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('update'),
      name: displayName.optional(),
      description: z.string().max(1000).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('attach_episode'),
      episodeId: stableId,
      projectId: stableId,
      label: displayName.optional(),
      narrativeRevision: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      type: z.literal('set_episode_order'),
      episodeIds: z.array(stableId).max(100),
    })
    .strict(),
  z.object({ type: z.literal('set_archived'), archived: z.boolean() }).strict(),
]);
export type SeriesCommand = z.infer<typeof commandSchema>;
export type SeriesCommandInput = {
  seriesId: string;
  commandId: string;
  idempotencyKey: string;
  expectedRevision: number;
  command: SeriesCommand;
  origin?: 'ui' | 'mcp';
};
export async function applySeriesCommand(input: SeriesCommandInput) {
  const command = commandSchema.parse(input.command);
  return persistScopedWrite(
    { ...input, scope: 'series', scopeId: input.seriesId, command },
    async () => {
      const db = await getDb();
      const state = await getSeries(input.seriesId);
      checkRevision(state?.revision ?? 0, input.expectedRevision);
      if (command.type === 'create') {
        if (state)
          throw new ScopeError('INVALID_COMMAND', 'Series already exists.');
        await db.insert(series).values({
          id: input.seriesId,
          name: command.name,
          description: command.description ?? '',
          revision: 1,
          archivedAt: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        return (await getSeries(input.seriesId))!;
      }
      if (!state) throw new ScopeError('NOT_FOUND', 'Series not found.');
      if (state.archivedAt && command.type !== 'set_archived')
        throw new ScopeError('SCOPE_MISMATCH', 'Restore this Series first.');
      switch (command.type) {
        case 'update':
          await db
            .update(series)
            .set({
              ...(command.name ? { name: command.name } : {}),
              ...(command.description !== undefined
                ? { description: command.description }
                : {}),
            })
            .where(eq(series.id, input.seriesId));
          break;
        case 'attach_episode': {
          if (state.episodes.length >= seriesLimits.episodes)
            throw new ScopeError(
              'CAPACITY_EXCEEDED',
              'Series episode limit reached.',
            );
          const narrative = await getNarrative(command.projectId);
          if (narrative.episode)
            throw new ScopeError(
              'SCOPE_MISMATCH',
              'Project already belongs to a Series.',
            );
          checkRevision(narrative.revision, command.narrativeRevision);
          await db.insert(seriesEpisode).values({
            id: command.episodeId,
            seriesId: input.seriesId,
            projectId: command.projectId,
            label: command.label ?? null,
            orderKey: state.episodes.length,
            createdAt: Date.now(),
          });
          await bumpNarrative(command.projectId, narrative.revision);
          break;
        }
        case 'set_episode_order': {
          const ids = state.episodes.map((e) => e.id);
          if (
            command.episodeIds.length !== ids.length ||
            new Set(command.episodeIds).size !== ids.length ||
            command.episodeIds.some((id) => !ids.includes(id))
          )
            throw new ScopeError(
              'INVALID_COMMAND',
              'Provide every episode exactly once.',
            );
          for (const [orderKey, id] of command.episodeIds.entries())
            await db
              .update(seriesEpisode)
              .set({ orderKey })
              .where(
                and(
                  eq(seriesEpisode.id, id),
                  eq(seriesEpisode.seriesId, input.seriesId),
                ),
              );
          break;
        }
        case 'set_archived':
          await db
            .update(series)
            .set({ archivedAt: command.archived ? Date.now() : null })
            .where(eq(series.id, input.seriesId));
          break;
      }
      await db
        .update(series)
        .set({ revision: state.revision + 1, updatedAt: Date.now() })
        .where(
          and(
            eq(series.id, input.seriesId),
            eq(series.revision, state.revision),
          ),
        );
      return (await getSeries(input.seriesId))!;
    },
  );
}
