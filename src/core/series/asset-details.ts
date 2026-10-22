import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import {
  generationAssetLink,
  generationHistory,
  projectCanvasCardLocator,
  seriesReferenceConsumer,
  seriesElementVersion,
  seriesElement,
} from '@/config/db/schema';
import { getDb } from '@/core/workspace-lib/db-adapter';
import { getProjectAssetById } from '@/core/workspace-lib/assets/user-assets';
import { getSeriesAsset } from './shared-assets';
import { requireEpisode } from './service';
import { ScopeError } from './contracts';
import { loadProjectTimeline } from '@/core/editor/timeline-state';
import { getTimelineUsage } from '@/core/editor/timeline-usage';
import { getOrganization } from '@/core/organization/service';
import { getNarrative } from './narrative';
import { getActiveProject } from '@/core/projects/projects';
import { defaultCanvasId } from '@/core/projects/canvas-identity';

export async function getScopedAssetDetails(
  projectId: string,
  assetId: string,
  sharedSeriesId?: string,
  historyOffset = 0,
) {
  if (
    !Number.isSafeInteger(historyOffset) ||
    historyOffset < 0 ||
    historyOffset > 10000
  )
    throw new ScopeError('INVALID_COMMAND', 'Invalid history offset.');
  const db = await getDb();
  const narrative = await getNarrative(projectId);
  if (sharedSeriesId) await requireEpisode(sharedSeriesId, projectId, true);
  async function accessible(id: string) {
    const local = await getProjectAssetById({ projectId, assetId: id });
    if (local)
      return {
        id: local.id,
        type: local.type,
        filename: local.filename,
        url: local.publicUrl,
      };
    if (sharedSeriesId)
      try {
        const asset = await getSeriesAsset(sharedSeriesId, id);
        return {
          id: asset.id,
          type: asset.type,
          filename: asset.filename,
          url:
            asset.storageProvider === 'local'
              ? `/api/app/series/${encodeURIComponent(sharedSeriesId)}/assets/${encodeURIComponent(id)}`
              : asset.publicUrl,
        };
      } catch {
        return null;
      }
    return null;
  }
  const asset = await accessible(assetId);
  if (!asset)
    throw new ScopeError('SCOPE_MISMATCH', 'Media is outside this scope.');
  const producing: (typeof generationHistory.$inferSelect)[] = await db
    .select({ generation: generationHistory })
    .from(generationAssetLink)
    .innerJoin(
      generationHistory,
      eq(generationHistory.id, generationAssetLink.generationId),
    )
    .where(
      and(
        eq(generationAssetLink.assetId, assetId),
        eq(generationAssetLink.role, 'output'),
      ),
    )
    .limit(20)
    .then((rows: any[]) => rows.map((row) => row.generation));
  if (!producing.length) {
    const [legacy] = await db
      .select()
      .from(generationHistory)
      .where(eq(generationHistory.resultAssetId, assetId))
      .limit(1);
    if (legacy) producing.push(legacy);
  }
  const batches: {
    generationId: string;
    results: {
      id: string;
      type: string;
      filename: string | null;
      url: string;
    }[];
  }[] = [];
  for (const generation of producing) {
    const links: (typeof generationAssetLink.$inferSelect)[] = await db
      .select()
      .from(generationAssetLink)
      .where(
        and(
          eq(generationAssetLink.generationId, generation.id),
          eq(generationAssetLink.role, 'output'),
        ),
      )
      .limit(100);
    const results = await Promise.all(
      [
        ...new Set([
          ...(generation.resultAssetId ? [generation.resultAssetId] : []),
          ...links.map((l) => l.assetId),
        ]),
      ].map(accessible),
    );
    batches.push({
      generationId: generation.id,
      results: results.filter((a): a is NonNullable<typeof a> => a !== null),
    });
  }
  const primary = producing[0];
  const frozen = (
    primary?.input as {
      _source?: { canvasSource?: { sourceCardId?: string; canvasId?: string } };
    } | null
  )?._source?.canvasSource;
  let sourceLocator: {
    projectId: string;
    canvasId: string;
    cardId: string;
    moved: boolean;
  } | null = null;
  const history: {
    id: string;
    status: string;
    createdAt: string;
    prompt: string | null;
    asset: Awaited<ReturnType<typeof accessible>>;
  }[] = [];
  let historyHasMore = false;
  if (primary?.projectId && frozen?.sourceCardId) {
    const [locator] = await db
      .select()
      .from(projectCanvasCardLocator)
      .where(
        and(
          eq(projectCanvasCardLocator.projectId, primary.projectId),
          eq(projectCanvasCardLocator.cardId, frozen.sourceCardId),
        ),
      )
      .limit(1);
    if (
      !locator?.deleted &&
      (await getActiveProject({ projectId: primary.projectId }))
    )
      sourceLocator = {
        projectId: primary.projectId,
        cardId: frozen.sourceCardId,
        canvasId:
          locator?.canvasId ??
          frozen.canvasId ??
          defaultCanvasId(primary.projectId),
        moved: Boolean(
          locator &&
          locator.canvasId !==
            (frozen.canvasId ?? defaultCanvasId(primary.projectId)),
        ),
      };
    const rows: (typeof generationHistory.$inferSelect)[] = await db
      .select()
      .from(generationHistory)
      .where(
        and(
          eq(generationHistory.projectId, primary.projectId),
          sql`json_extract(${generationHistory.input}, '$._source.canvasSource.sourceCardId') = ${frozen.sourceCardId}`,
        ),
      )
      .orderBy(desc(generationHistory.createdAt), desc(generationHistory.id))
      .offset(Math.max(0, Math.min(10000, historyOffset)))
      .limit(101);
    historyHasMore = rows.length > 100;
    for (const row of rows.slice(0, 100))
      history.push({
        id: row.id,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        prompt: row.submittedPrompt,
        asset: row.resultAssetId ? await accessible(row.resultAssetId) : null,
      });
  }
  const timeline = await loadProjectTimeline(projectId);
  const clips = getTimelineUsage(
    timeline?.document ?? null,
    timeline?.version ?? null,
  )
    .clips.filter((c) => c.assetId === assetId)
    .map((c) => ({
      ...c,
      sceneId:
        narrative.clipScenes.find((tag: any) => tag.clipId === c.clipId)
          ?.sceneId ?? null,
    }));
  const referenceSeriesId = sharedSeriesId ?? narrative.episode?.seriesId;
  const identities: {
    consumer: typeof seriesReferenceConsumer.$inferSelect;
  }[] = await db
    .select({ consumer: seriesReferenceConsumer })
    .from(seriesReferenceConsumer)
    .innerJoin(
      seriesElementVersion,
      eq(seriesElementVersion.id, seriesReferenceConsumer.versionId),
    )
    .where(
      and(
        eq(seriesElementVersion.assetId, assetId),
        referenceSeriesId
          ? eq(seriesReferenceConsumer.seriesId, referenceSeriesId)
          : eq(seriesReferenceConsumer.projectId, projectId),
      ),
    )
    .limit(101);
  const sharedVersions: {
    elementId: string;
    versionId: string;
    name: string;
    kind: string;
    ordinal: number;
    ownerId: string;
    archivedAt: number | null;
  }[] = referenceSeriesId
    ? await db
        .select({
          elementId: seriesElement.id,
          versionId: seriesElementVersion.id,
          name: seriesElement.name,
          kind: seriesElement.kind,
          ordinal: seriesElementVersion.ordinal,
          ownerId: seriesElement.seriesId,
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
            eq(seriesElementVersion.assetId, assetId),
          ),
        )
    : [];
  const localElements = Object.values(
    (await getOrganization(projectId)).document.elements,
  ).filter((e) => !e.deletedAt);
  const elementVersions = [
    ...sharedVersions.map((v) => ({ ...v, scope: 'series' as const })),
    ...localElements.flatMap((e) =>
      Object.values(e.versions)
        .filter((v) => v.assetId === assetId)
        .map((v) => ({
          elementId: e.id,
          versionId: v.id,
          name: e.name,
          kind: e.kind,
          ordinal: null,
          ownerId: projectId,
          archivedAt: null,
          scope: 'project' as const,
        })),
    ),
  ];
  return {
    asset,
    elementVersions,
    batches,
    history,
    historyOffset,
    historyHasMore,
    sourceLocator,
    clips,
    timelineRevision: timeline?.version ?? null,
    consumers: identities
      .slice(0, 100)
      .map(
        (row: { consumer: typeof seriesReferenceConsumer.$inferSelect }) =>
          row.consumer,
      ),
    consumersTruncated: identities.length > 100,
    prompt: primary?.submittedPrompt ?? null,
    historyUnavailable: !frozen?.sourceCardId,
    mediaAccessibleInEpisode: Boolean(
      await getProjectAssetById({ projectId, assetId }),
    ),
  };
}
