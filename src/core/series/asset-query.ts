import {
  and,
  asc,
  eq,
  exists,
  gt,
  inArray,
  isNull,
  not,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { z } from 'zod';
import {
  userAsset,
  project,
  seriesReferenceConsumer,
  projectAssetMembership,
  projectCanvasDocument,
  projectCanvasState,
  projectAssetScene,
  seriesAssetMembership,
  seriesElement,
  seriesElementVersion,
  workspaceAssetRevision,
} from '@/config/db/schema';
import { getDb } from '@/core/workspace-lib/db-adapter';
import { getOrganization } from '@/core/organization/service';
import { getNarrative, requireScene } from './narrative';
import { getSeries, requireEpisode } from './service';
import { fingerprint, ScopeError, stableId } from './contracts';
import { loadProjectTimeline } from '@/core/editor/timeline-state';
import { getTimelineUsage } from '@/core/editor/timeline-usage';
import {
  buildLocalProjectAssetUrl,
  LOCAL_PROJECT_ASSET_PROVIDER,
} from '@/core/projects/local-project-assets';
import { assetLibraryRevision } from './library-clock';

export const scopedAssetQuerySchema = z
  .object({
    scope: z.enum(['scene', 'episode', 'series']),
    includeArchived: z.boolean().default(false),
    projectId: stableId.optional(),
    sceneId: stableId.optional(),
    seriesId: stableId.optional(),
    mediaType: z.enum(['image', 'video', 'audio']).optional(),
    elementKind: z
      .enum(['character', 'scene', 'prop', 'voice', 'other'])
      .optional(),
    folderId: stableId.nullable().optional(),
    usage: z
      .enum(['reference', 'candidate', 'timeline', 'unassigned'])
      .optional(),
    query: z.string().max(500).default(''),
    cursor: z.string().max(8192).optional(),
    limit: z.number().int().min(1).max(500).default(100),
  })
  .strict();
export type ScopedAssetQuery = z.input<typeof scopedAssetQuerySchema>;
export async function queryScopedAssets(input: ScopedAssetQuery) {
  const query = scopedAssetQuerySchema.parse(input);
  const db = await getDb();
  const startedAtRevision = await assetLibraryRevision();
  const conditions: SQL[] = [];
  let seriesId = query.seriesId;
  const narrative = query.projectId
    ? await getNarrative(query.projectId)
    : null;
  if (query.scope === 'series') {
    seriesId ??= narrative?.episode?.seriesId;
    if (!seriesId || !(await getSeries(seriesId)))
      throw new ScopeError('SCOPE_MISMATCH', 'Choose a Series.');
    if (query.projectId) await requireEpisode(seriesId, query.projectId, true);
    if (query.folderId !== undefined)
      throw new ScopeError(
        'SCOPE_MISMATCH',
        'Episode folders cannot filter the shared library.',
      );
    conditions.push(
      exists(
        db
          .select({ id: seriesAssetMembership.id })
          .from(seriesAssetMembership)
          .where(
            and(
              eq(seriesAssetMembership.seriesId, seriesId),
              eq(seriesAssetMembership.assetId, userAsset.id),
              query.includeArchived
                ? undefined
                : isNull(seriesAssetMembership.archivedAt),
            ),
          ),
      ),
    );
  } else {
    if (!query.projectId || !narrative)
      throw new ScopeError('INVALID_COMMAND', 'Choose an episode Project.');
    conditions.push(
      exists(
        db
          .select({ id: projectAssetMembership.id })
          .from(projectAssetMembership)
          .where(
            and(
              eq(projectAssetMembership.projectId, query.projectId),
              eq(projectAssetMembership.assetId, userAsset.id),
            ),
          ),
      ),
    );
  }
  const organization = query.projectId
    ? await getOrganization(query.projectId)
    : null;
  const fromCards = (document: SQL) =>
    sql`EXISTS (SELECT 1 FROM json_each(${document}, '$.cards') AS scene_card WHERE json_extract(scene_card.value, '$.assetId') = ${userAsset.id} OR EXISTS (SELECT 1 FROM generation_asset_link AS scene_output WHERE scene_output.asset_id = ${userAsset.id} AND scene_output.role = 'output' AND scene_output.generation_id = json_extract(scene_card.value, '$.sourceGenerationId')))`;
  if (query.scope === 'scene') {
    if (!query.sceneId)
      throw new ScopeError('INVALID_COMMAND', 'Choose a scene.');
    await requireScene(query.projectId!, query.sceneId);
    const explicit = exists(
      db
        .select({ id: projectAssetScene.id })
        .from(projectAssetScene)
        .where(
          and(
            eq(projectAssetScene.sceneId, query.sceneId),
            eq(projectAssetScene.assetId, userAsset.id),
          ),
        ),
    );
    const sceneDocuments = exists(
      db
        .select({ id: projectCanvasDocument.id })
        .from(projectCanvasDocument)
        .where(
          and(
            eq(projectCanvasDocument.projectId, query.projectId!),
            eq(projectCanvasDocument.sceneId, query.sceneId),
            eq(projectCanvasDocument.storageKind, 'document'),
            isNull(projectCanvasDocument.archivedAt),
            fromCards(sql`${projectCanvasDocument.documentJson}`),
          ),
        ),
    );
    const defaultBelongs = narrative!.canvases.some(
      (c) => c.storageKind === 'legacy_default' && c.sceneId === query.sceneId,
    );
    const defaultCards = defaultBelongs
      ? exists(
          db
            .select({ id: projectCanvasState.projectId })
            .from(projectCanvasState)
            .where(
              and(
                eq(projectCanvasState.projectId, query.projectId!),
                fromCards(sql`${projectCanvasState.documentJson}`),
              ),
            ),
        )
      : sql`0`;
    conditions.push(or(explicit, sceneDocuments, defaultCards)!);
  }
  if (query.mediaType) conditions.push(eq(userAsset.type, query.mediaType));
  if (query.query)
    conditions.push(
      sql`instr(lower(coalesce(${userAsset.filename}, '') || ' ' || ${userAsset.id}), ${query.query.toLowerCase()}) > 0`,
    );
  const localElements = Object.values(
    organization?.document.elements ?? {},
  ).filter((e) => !e.deletedAt);
  if (query.folderId !== undefined && query.scope !== 'series') {
    if (query.folderId && !organization?.document.folders[query.folderId])
      throw new ScopeError('NOT_FOUND', 'Folder not found.');
    const assigned = Object.keys(organization?.document.assetLocations ?? {});
    const ids = assigned.filter(
      (id) => organization!.document.assetLocations[id] === query.folderId,
    );
    conditions.push(
      query.folderId
        ? ids.length
          ? inArray(userAsset.id, ids)
          : sql`0`
        : assigned.length
          ? notInArray(userAsset.id, assigned)
          : sql`1`,
    );
  }
  const referenceSeriesId =
    query.scope === 'series' ? seriesId : narrative?.episode?.seriesId;
  const sharedReference = referenceSeriesId
    ? exists(
        db
          .select({ id: seriesElementVersion.id })
          .from(seriesElementVersion)
          .innerJoin(
            seriesElement,
            eq(seriesElement.id, seriesElementVersion.elementId),
          )
          .where(
            and(
              eq(seriesElement.seriesId, referenceSeriesId),
              query.scope === 'series'
                ? isNull(seriesElement.archivedAt)
                : undefined,
              eq(seriesElementVersion.assetId, userAsset.id),
              query.elementKind && query.elementKind !== 'other'
                ? eq(seriesElement.kind, query.elementKind)
                : undefined,
            ),
          ),
      )
    : sql`0`;
  const localReference = (() => {
    const ids = localElements
      .filter(
        (e) =>
          !query.elementKind ||
          query.elementKind === 'other' ||
          e.kind === query.elementKind,
      )
      .flatMap((e) => Object.values(e.versions).map((v) => v.assetId));
    return ids.length ? inArray(userAsset.id, [...new Set(ids)]) : sql`0`;
  })();
  const referenceFilter =
    query.scope === 'series'
      ? sharedReference
      : or(localReference, sharedReference)!;
  if (query.elementKind)
    conditions.push(
      query.elementKind === 'other' ? not(referenceFilter) : referenceFilter,
    );
  const timeline = query.projectId
    ? await loadProjectTimeline(query.projectId)
    : null;
  const clips = getTimelineUsage(
    timeline?.document ?? null,
    timeline?.version ?? null,
  ).clips;
  const used = [
    ...new Set(clips.flatMap((c) => (c.assetId ? [c.assetId] : []))),
  ];
  if (query.usage === 'timeline') {
    if (!query.projectId)
      throw new ScopeError(
        'INVALID_COMMAND',
        'Choose an episode to inspect its Timeline adoption.',
      );
    conditions.push(used.length ? inArray(userAsset.id, used) : sql`0`);
  }
  if (query.usage === 'candidate')
    conditions.push(
      eq(userAsset.source, 'provider'),
      used.length ? notInArray(userAsset.id, used) : sql`1`,
    );
  if (query.usage === 'reference')
    conditions.push(
      or(
        referenceFilter,
        exists(
          db
            .select({ id: projectAssetMembership.id })
            .from(projectAssetMembership)
            .where(
              and(
                eq(projectAssetMembership.assetId, userAsset.id),
                query.projectId
                  ? eq(projectAssetMembership.projectId, query.projectId)
                  : sql`0`,
                eq(projectAssetMembership.category, 'reference'),
              ),
            ),
        ),
      )!,
    );
  if (query.usage === 'unassigned') {
    if (!query.projectId)
      throw new ScopeError('INVALID_COMMAND', 'Choose an episode.');
    conditions.push(
      not(
        exists(
          db
            .select({ id: projectAssetScene.id })
            .from(projectAssetScene)
            .where(
              and(
                eq(projectAssetScene.projectId, query.projectId),
                eq(projectAssetScene.assetId, userAsset.id),
              ),
            ),
        ),
      ),
    );
    conditions.push(
      not(
        exists(
          db
            .select({ id: projectCanvasDocument.id })
            .from(projectCanvasDocument)
            .where(
              and(
                eq(projectCanvasDocument.projectId, query.projectId),
                not(isNull(projectCanvasDocument.sceneId)),
                eq(projectCanvasDocument.storageKind, 'document'),
                fromCards(sql`${projectCanvasDocument.documentJson}`),
              ),
            ),
        ),
      ),
    );
    if (
      narrative!.canvases.some(
        (c) => c.storageKind === 'legacy_default' && c.sceneId,
      )
    )
      conditions.push(
        not(
          exists(
            db
              .select({ id: projectCanvasState.projectId })
              .from(projectCanvasState)
              .where(
                and(
                  eq(projectCanvasState.projectId, query.projectId),
                  fromCards(sql`${projectCanvasState.documentJson}`),
                ),
              ),
          ),
        ),
      );
  }
  const { cursor: ignoredCursor, ...filter } = query;
  const token = fingerprint({
    filter,
    seriesId,
    libraryRevision: startedAtRevision,
    organizationRevision: organization?.revision ?? null,
    narrativeRevision: narrative?.revision ?? null,
    timelineRevision: timeline?.version ?? null,
  });
  let after = '';
  if (query.cursor) {
    try {
      const cursor = z
        .object({ token: z.string(), after: z.string() })
        .strict()
        .parse(JSON.parse(Buffer.from(query.cursor, 'base64url').toString()));
      if (cursor.token !== token) throw new Error();
      after = cursor.after;
    } catch {
      throw new ScopeError(
        'REVISION_CONFLICT',
        'Asset query changed. Restart pagination.',
      );
    }
  }
  const [count] = await db
    .select({ count: sql<number>`count(*)` })
    .from(userAsset)
    .where(and(...conditions));
  const rows: (typeof userAsset.$inferSelect)[] = await db
    .select()
    .from(userAsset)
    .where(and(...conditions, after ? gt(userAsset.id, after) : undefined))
    .orderBy(asc(userAsset.id))
    .limit(query.limit + 1);
  if ((await assetLibraryRevision()) !== startedAtRevision)
    throw new ScopeError(
      'REVISION_CONFLICT',
      'Assets changed while reading. Refresh this query.',
    );
  const page = rows.slice(0, query.limit);
  const sharedVersions: {
    assetId: string;
    elementId: string;
    versionId: string;
    name: string;
    kind: string;
    archivedAt: number | null;
  }[] =
    referenceSeriesId && page.length
      ? await db
          .select({
            assetId: seriesElementVersion.assetId,
            elementId: seriesElement.id,
            versionId: seriesElementVersion.id,
            name: seriesElement.name,
            kind: seriesElement.kind,
            archivedAt: seriesElement.archivedAt,
          })
          .from(seriesElementVersion)
          .innerJoin(
            seriesElement,
            eq(seriesElement.id, seriesElementVersion.elementId),
          )
          .where(
            and(
              eq(seriesElement.seriesId, referenceSeriesId),
              inArray(
                seriesElementVersion.assetId,
                page.map((a) => a.id),
              ),
            ),
          )
      : [];
  if ((await assetLibraryRevision()) !== startedAtRevision)
    throw new ScopeError(
      'REVISION_CONFLICT',
      'Assets changed while reading. Refresh this query.',
    );
  const memberships: { assetId: string; archivedAt: number | null }[] =
    query.scope === 'series' && page.length
      ? await db
          .select({
            assetId: seriesAssetMembership.assetId,
            archivedAt: seriesAssetMembership.archivedAt,
          })
          .from(seriesAssetMembership)
          .where(
            and(
              eq(seriesAssetMembership.seriesId, seriesId!),
              inArray(
                seriesAssetMembership.assetId,
                page.map((a) => a.id),
              ),
            ),
          )
      : [];
  const originIds = [
    ...new Set(
      page
        .map((a) => a.originProjectId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const origins: { id: string; name: string }[] = originIds.length
    ? await db
        .select({ id: project.id, name: project.name })
        .from(project)
        .where(inArray(project.id, originIds))
    : [];
  const consumerCounts: { assetId: string; count: number }[] =
    referenceSeriesId && page.length
      ? await db
          .select({
            assetId: seriesElementVersion.assetId,
            count: sql<number>`count(*)`,
          })
          .from(seriesReferenceConsumer)
          .innerJoin(
            seriesElementVersion,
            eq(seriesElementVersion.id, seriesReferenceConsumer.versionId),
          )
          .where(
            and(
              eq(seriesReferenceConsumer.seriesId, referenceSeriesId),
              inArray(
                seriesElementVersion.assetId,
                page.map((a) => a.id),
              ),
            ),
          )
          .groupBy(seriesElementVersion.assetId)
      : [];
  if ((await assetLibraryRevision()) !== startedAtRevision)
    throw new ScopeError(
      'REVISION_CONFLICT',
      'Assets changed while reading. Refresh this query.',
    );
  return {
    scope: query.scope,
    projectId: query.projectId ?? null,
    sceneId: query.sceneId ?? null,
    seriesId: seriesId ?? null,
    revision: token,
    total: Number(count.count),
    nextCursor:
      rows.length > query.limit
        ? Buffer.from(
            JSON.stringify({ token, after: page.at(-1)!.id }),
          ).toString('base64url')
        : null,
    assets: page.map((asset) => ({
      id: asset.id,
      type: asset.type,
      filename: asset.filename,
      source: asset.source,
      sharedArchivedAt:
        memberships.find((m) => m.assetId === asset.id)?.archivedAt ?? null,
      originProjectId: asset.originProjectId,
      originProjectName:
        origins.find((p) => p.id === asset.originProjectId)?.name ?? null,
      sharedConsumerCount: Number(
        consumerCounts.find((c) => c.assetId === asset.id)?.count ?? 0,
      ),
      publicUrl:
        asset.storageProvider === LOCAL_PROJECT_ASSET_PROVIDER
          ? query.scope === 'series'
            ? `/api/app/series/${encodeURIComponent(seriesId!)}/assets/${encodeURIComponent(asset.id)}`
            : buildLocalProjectAssetUrl({
                projectId: query.projectId!,
                assetId: asset.id,
              })
          : asset.publicUrl,
      thumbnailUrl:
        asset.type === 'video' && query.scope !== 'series'
          ? `${buildLocalProjectAssetUrl({ projectId: query.projectId!, assetId: asset.id })}/thumbnail`
          : null,
      folderId: organization?.document.assetLocations[asset.id] ?? null,
      durationMs: asset.durationMs,
      timelineUseCount: query.projectId
        ? clips.filter((c) => c.assetId === asset.id).length
        : null,
      elementVersions: [
        ...(query.scope === 'series'
          ? []
          : localElements.flatMap((e) =>
              Object.values(e.versions)
                .filter((v) => v.assetId === asset.id)
                .map((v) => ({
                  scope: 'project' as const,
                  ownerId: query.projectId!,
                  elementId: e.id,
                  name: e.name,
                  kind: e.kind as string,
                  versionId: v.id,
                  archivedAt: null as number | null,
                })),
            )),
        ...sharedVersions
          .filter((v) => v.assetId === asset.id)
          .map((v) => ({
            scope: 'series' as const,
            ownerId: referenceSeriesId!,
            elementId: v.elementId,
            name: v.name,
            kind: v.kind,
            versionId: v.versionId,
            archivedAt: v.archivedAt,
          })),
      ],
    })),
  };
}
