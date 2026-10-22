import { and, asc, eq, inArray, gt, sql } from 'drizzle-orm';
import { stat } from 'node:fs/promises';
import { z } from 'zod';
import {
  series,
  seriesAssetMembership,
  seriesElement,
  seriesElementVersion,
  seriesReferenceConsumer,
  userAsset,
} from '@/config/db/schema';
import { getDb } from '@/core/workspace-lib/db-adapter';
import {
  getProjectAssetById,
  linkProjectAsset,
} from '@/core/workspace-lib/assets/user-assets';
import {
  buildLocalProjectAssetUrl,
  LOCAL_PROJECT_ASSET_PROVIDER,
  resolveLocalProjectAssetPath,
} from '@/core/projects/local-project-assets';
import { persistScopedWrite } from '@/core/commands/scoped-write';
import { scopedCanvasId } from '@/core/projects/canvas-scope';
import { checkRevision, displayName, ScopeError, stableId } from './contracts';
import { getSeries, requireEpisode } from './service';
import type { ReusableElement } from '@/core/organization/organization-document';
import type { ProjectSnapshotDocument } from '@/core/projects/project-snapshot';
import { assetLibraryRevision } from './library-clock';
import { fingerprint } from './contracts';
import {
  assertPreviewToken,
  createPreviewToken,
  readPreviewToken,
} from './preview';

type ElementReference = {
  scope?: 'series' | 'project';
  ownerId?: string;
  elementId: string;
  versionId: string;
  assetId: string;
};
export async function assertSharedMediaAvailable(asset: {
  storageProvider: string | null;
  objectKey: string;
  publicUrl: string;
}) {
  if (asset.storageProvider === LOCAL_PROJECT_ASSET_PROVIDER) {
    try {
      const info = await stat(
        resolveLocalProjectAssetPath({ objectKey: asset.objectKey }),
      );
      if (!info.isFile() || info.size === 0) throw new Error();
    } catch {
      throw new ScopeError(
        'NOT_FOUND',
        'Reference media file is missing. Restore it before using this version.',
      );
    }
  } else if (!asset.publicUrl)
    throw new ScopeError('NOT_FOUND', 'Reference media is unavailable.');
}
export async function resolveElementReference(
  projectId: string,
  reference: ElementReference,
  options: {
    forNewUse?: boolean;
    grant?: boolean;
    checkFile?: boolean;
    preview?: boolean;
  } = {},
) {
  if (reference.scope !== 'series') {
    if (reference.ownerId && reference.ownerId !== projectId)
      throw new ScopeError(
        'SCOPE_MISMATCH',
        'Element owner must be the current Project.',
      );
    const { getOrganization } = await import('@/core/organization/service');
    const { document } = await getOrganization(projectId);
    const element = document.elements[reference.elementId];
    if (
      !element ||
      element.deletedAt ||
      element.versions[reference.versionId]?.assetId !== reference.assetId
    )
      throw new ScopeError(
        'SCOPE_MISMATCH',
        'Project Element version is unavailable.',
      );
    return element;
  }
  if (!reference.ownerId)
    throw new ScopeError(
      'SCOPE_MISMATCH',
      'Shared reference requires a Series owner.',
    );
  await requireEpisode(reference.ownerId, projectId, !options.forNewUse);
  const db = await getDb();
  const [element]: (typeof seriesElement.$inferSelect)[] = await db
    .select()
    .from(seriesElement)
    .where(
      and(
        eq(seriesElement.id, reference.elementId),
        eq(seriesElement.seriesId, reference.ownerId),
      ),
    )
    .limit(1);
  const versions: (typeof seriesElementVersion.$inferSelect)[] = element
    ? await db
        .select()
        .from(seriesElementVersion)
        .where(eq(seriesElementVersion.elementId, element.id))
        .orderBy(asc(seriesElementVersion.ordinal))
    : [];
  const version = versions.find(
    (v) => v.id === reference.versionId && v.assetId === reference.assetId,
  );
  const [membership] = await db
    .select()
    .from(seriesAssetMembership)
    .where(
      and(
        eq(seriesAssetMembership.seriesId, reference.ownerId),
        eq(seriesAssetMembership.assetId, reference.assetId),
      ),
    )
    .limit(1);
  if (
    !element ||
    !version ||
    !membership ||
    (options.forNewUse && (element.archivedAt || membership.archivedAt))
  )
    throw new ScopeError(
      'SCOPE_MISMATCH',
      'Shared Element version is unavailable in this Series.',
    );
  const [asset] = await db
    .select()
    .from(userAsset)
    .where(eq(userAsset.id, version.assetId))
    .limit(1);
  if (!asset) throw new ScopeError('NOT_FOUND', 'Shared media is missing.');
  if (options.checkFile) await assertSharedMediaAvailable(asset);
  if (options.grant)
    await linkProjectAsset({
      projectId,
      assetId: asset.id,
      role: 'reference',
      metadata: {
        sharedFrom: {
          seriesId: reference.ownerId,
          elementId: element.id,
          versionId: version.id,
          sourceProjectId: version.sourceProjectId,
        },
      },
    });
  if (
    !options.preview &&
    !(await getProjectAssetById({ projectId, assetId: asset.id }))
  )
    throw new ScopeError(
      'SCOPE_MISMATCH',
      'Use the shared reference in this episode before binding it.',
    );
  return {
    id: element.id,
    name: element.name,
    kind: element.kind as ReusableElement['kind'],
    description: element.description,
    currentVersionId: element.currentVersionId,
    deletedAt: null,
    versions: Object.fromEntries(
      versions.map((v) => [
        v.id,
        {
          id: v.id,
          assetId: v.assetId,
          mediaType: element.kind === 'voice' ? 'audio' : 'image',
          createdAt: new Date(v.createdAt).toISOString(),
        },
      ]),
    ),
  } as ReusableElement;
}
export async function getSharedLibrary(seriesId: string) {
  const state = await getSeries(seriesId);
  if (!state) throw new ScopeError('NOT_FOUND', 'Series not found.');
  const db = await getDb();
  const elements: (typeof seriesElement.$inferSelect)[] = await db
    .select()
    .from(seriesElement)
    .where(eq(seriesElement.seriesId, seriesId));
  const ids = elements.map((e) => e.id);
  const versions: (typeof seriesElementVersion.$inferSelect)[] = ids.length
    ? await db
        .select()
        .from(seriesElementVersion)
        .where(inArray(seriesElementVersion.elementId, ids))
        .orderBy(asc(seriesElementVersion.ordinal))
    : [];
  const consumers: (typeof seriesReferenceConsumer.$inferSelect)[] = await db
    .select()
    .from(seriesReferenceConsumer)
    .where(eq(seriesReferenceConsumer.seriesId, seriesId))
    .orderBy(asc(seriesReferenceConsumer.id))
    .limit(1000);
  const counts: { elementId: string; count: number }[] = await db
    .select({
      elementId: seriesReferenceConsumer.elementId,
      count: sql<number>`count(*)`,
    })
    .from(seriesReferenceConsumer)
    .where(eq(seriesReferenceConsumer.seriesId, seriesId))
    .groupBy(seriesReferenceConsumer.elementId);
  const assetIds = [...new Set(versions.map((v) => v.assetId))];
  const assets: Pick<
    typeof userAsset.$inferSelect,
    'id' | 'type' | 'storageProvider' | 'publicUrl'
  >[] = assetIds.length
    ? await db
        .select({
          id: userAsset.id,
          type: userAsset.type,
          storageProvider: userAsset.storageProvider,
          publicUrl: userAsset.publicUrl,
        })
        .from(userAsset)
        .where(inArray(userAsset.id, assetIds))
    : [];
  return {
    seriesId,
    revision: state.revision,
    archivedAt: state.archivedAt,
    elements: elements.map((e) => ({
      ...e,
      versions: versions
        .filter((v) => v.elementId === e.id)
        .map((v) => {
          const asset = assets.find((a) => a.id === v.assetId);
          return {
            ...v,
            mediaType: asset?.type ?? null,
            url:
              asset?.storageProvider === LOCAL_PROJECT_ASSET_PROVIDER
                ? `/api/app/series/${encodeURIComponent(seriesId)}/assets/${encodeURIComponent(v.assetId)}`
                : (asset?.publicUrl ?? null),
          };
        }),
      consumers: consumers.filter((c) => c.elementId === e.id).slice(0, 100),
      consumerCount: Number(
        counts.find((c) => c.elementId === e.id)?.count ?? 0,
      ),
      consumersTruncated:
        Number(counts.find((c) => c.elementId === e.id)?.count ?? 0) >
        Math.min(100, consumers.filter((c) => c.elementId === e.id).length),
    })),
  };
}
export async function querySharedConsumers(
  seriesId: string,
  elementId: string,
  cursor?: string,
  limit = 100,
) {
  stableId.parse(seriesId);
  stableId.parse(elementId);
  const db = await getDb();
  const [element] = await db
    .select()
    .from(seriesElement)
    .where(
      and(
        eq(seriesElement.seriesId, seriesId),
        eq(seriesElement.id, elementId),
      ),
    )
    .limit(1);
  if (!element) throw new ScopeError('NOT_FOUND', 'Shared Element not found.');
  const revision = await assetLibraryRevision();
  const token = fingerprint([seriesId, elementId, revision]);
  let after = '';
  if (cursor)
    try {
      const data = JSON.parse(Buffer.from(cursor, 'base64url').toString());
      if (data.token !== token || typeof data.after !== 'string')
        throw new Error();
      after = data.after;
    } catch {
      throw new ScopeError(
        'REVISION_CONFLICT',
        'Consumer list changed. Restart pagination.',
      );
    }
  const where = and(
    eq(seriesReferenceConsumer.seriesId, seriesId),
    eq(seriesReferenceConsumer.elementId, elementId),
  );
  const [count] = await db
    .select({ count: sql<number>`count(*)` })
    .from(seriesReferenceConsumer)
    .where(where);
  const bounded = Math.max(1, Math.min(100, Math.floor(limit)));
  const rows: (typeof seriesReferenceConsumer.$inferSelect)[] = await db
    .select()
    .from(seriesReferenceConsumer)
    .where(
      and(where, after ? gt(seriesReferenceConsumer.id, after) : undefined),
    )
    .orderBy(asc(seriesReferenceConsumer.id))
    .limit(bounded + 1);
  if ((await assetLibraryRevision()) !== revision)
    throw new ScopeError(
      'REVISION_CONFLICT',
      'Consumer list changed. Refresh.',
    );
  const consumers = rows.slice(0, bounded);
  return {
    consumers,
    total: Number(count.count),
    revision: token,
    nextCursor:
      rows.length > bounded
        ? Buffer.from(
            JSON.stringify({ token, after: consumers.at(-1)!.id }),
          ).toString('base64url')
        : null,
  };
}

const archiveRequest = z
  .object({
    seriesId: stableId,
    elementId: stableId.optional(),
    assetIds: z.array(stableId).min(1).max(100).optional(),
  })
  .strict()
  .refine(
    (value) => Boolean(value.elementId) !== Boolean(value.assetIds),
    'Choose one archive target.',
  );
export async function previewSharedArchive(
  input: z.input<typeof archiveRequest>,
  issuedAt = Date.now(),
) {
  const request = archiveRequest.parse(input);
  const state = await getSeries(request.seriesId);
  if (!state || state.archivedAt)
    throw new ScopeError('NOT_FOUND', 'Active Series not found.');
  const db = await getDb();
  let consumers: (typeof seriesReferenceConsumer.$inferSelect)[] = [];
  if (request.elementId) {
    const [element] = await db
      .select()
      .from(seriesElement)
      .where(
        and(
          eq(seriesElement.seriesId, request.seriesId),
          eq(seriesElement.id, request.elementId),
        ),
      )
      .limit(1);
    if (!element) throw new ScopeError('NOT_FOUND', 'Element not found.');
    consumers = await db
      .select()
      .from(seriesReferenceConsumer)
      .where(
        and(
          eq(seriesReferenceConsumer.seriesId, request.seriesId),
          eq(seriesReferenceConsumer.elementId, request.elementId),
        ),
      )
      .orderBy(asc(seriesReferenceConsumer.id))
      .limit(101);
  } else {
    const members = await db
      .select()
      .from(seriesAssetMembership)
      .where(
        and(
          eq(seriesAssetMembership.seriesId, request.seriesId),
          inArray(seriesAssetMembership.assetId, request.assetIds!),
        ),
      );
    if (members.length !== new Set(request.assetIds).size)
      throw new ScopeError('SCOPE_MISMATCH', 'Assets are outside this Series.');
    const versions = await db
      .select({ id: seriesElementVersion.id })
      .from(seriesElementVersion)
      .innerJoin(
        seriesElement,
        eq(seriesElement.id, seriesElementVersion.elementId),
      )
      .where(
        and(
          eq(seriesElement.seriesId, request.seriesId),
          inArray(seriesElementVersion.assetId, request.assetIds!),
        ),
      );
    if (versions.length)
      consumers = await db
        .select()
        .from(seriesReferenceConsumer)
        .where(
          and(
            eq(seriesReferenceConsumer.seriesId, request.seriesId),
            inArray(
              seriesReferenceConsumer.versionId,
              versions.map((v: any) => v.id),
            ),
          ),
        )
        .orderBy(asc(seriesReferenceConsumer.id))
        .limit(101);
  }
  const observed = {
    seriesRevision: state.revision,
    libraryRevision: await assetLibraryRevision(),
    consumers,
  };
  return {
    request,
    seriesRevision: state.revision,
    consumers: consumers.slice(0, 100),
    consumersTruncated: consumers.length > 100,
    previewToken: createPreviewToken(
      'shared.archive',
      request,
      observed,
      issuedAt,
    ),
    expiresAt: issuedAt + 600_000,
    observed,
  };
}
export async function getSeriesAsset(seriesId: string, assetId: string) {
  if (!(await getSeries(seriesId)))
    throw new ScopeError('NOT_FOUND', 'Series not found.');
  const db = await getDb();
  const [row] = await db
    .select({ asset: userAsset })
    .from(seriesAssetMembership)
    .innerJoin(userAsset, eq(userAsset.id, seriesAssetMembership.assetId))
    .where(
      and(
        eq(seriesAssetMembership.seriesId, seriesId),
        eq(seriesAssetMembership.assetId, assetId),
      ),
    )
    .limit(1);
  if (!row)
    throw new ScopeError('SCOPE_MISMATCH', 'Media is outside this Series.');
  return row.asset as typeof userAsset.$inferSelect;
}
const sharedCommandSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('publish_assets'),
      sourceProjectId: stableId,
      assetIds: z.array(stableId).min(1).max(100),
    })
    .strict(),
  z
    .object({
      type: z.literal('archive_assets'),
      assetIds: z.array(stableId).min(1).max(100),
      archived: z.boolean(),
      previewToken: z.string().max(200000).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('publish_element'),
      elementId: stableId,
      versionId: stableId,
      name: displayName,
      kind: z.enum(['character', 'scene', 'prop', 'voice']),
      sourceProjectId: stableId,
      assetId: stableId,
      sourceElementId: stableId.optional(),
      sourceVersionId: stableId.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('add_version'),
      elementId: stableId,
      versionId: stableId,
      sourceProjectId: stableId,
      assetId: stableId,
      note: z.string().max(1000).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('set_current'),
      elementId: stableId,
      observedCurrentVersionId: stableId,
      versionId: stableId,
    })
    .strict(),
  z
    .object({
      type: z.literal('archive_element'),
      elementId: stableId,
      archived: z.boolean(),
      previewToken: z.string().max(200000).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('use_assets'),
      projectId: stableId,
      assetIds: z.array(stableId).min(1).max(100),
    })
    .strict(),
]);
export type SharedCommand = z.infer<typeof sharedCommandSchema>;
export async function applySharedCommand(input: {
  seriesId: string;
  commandId: string;
  idempotencyKey: string;
  expectedRevision: number;
  command: SharedCommand;
  origin?: 'ui' | 'mcp';
}) {
  const command = sharedCommandSchema.parse(input.command);
  return persistScopedWrite(
    { ...input, scope: 'series', scopeId: input.seriesId, command },
    async () => {
      const state = await getSeries(input.seriesId);
      if (!state || state.archivedAt)
        throw new ScopeError('NOT_FOUND', 'Active Series not found.');
      checkRevision(state.revision, input.expectedRevision);
      const db = await getDb();
      if (
        (command.type === 'archive_assets' ||
          command.type === 'archive_element') &&
        command.archived
      ) {
        if (!command.previewToken)
          throw new ScopeError(
            'INVALID_COMMAND',
            'Preview the archive impact first.',
          );
        const token = readPreviewToken(command.previewToken, 'shared.archive');
        const request = {
          seriesId: input.seriesId,
          ...(command.type === 'archive_element'
            ? { elementId: command.elementId }
            : { assetIds: command.assetIds }),
        };
        const preview = await previewSharedArchive(request, token.issuedAt);
        assertPreviewToken(
          command.previewToken,
          'shared.archive',
          preview.request,
          preview.observed,
        );
      }
      async function publish(assetId: string, sourceProjectId: string) {
        await requireEpisode(input.seriesId, sourceProjectId);
        const asset = await getProjectAssetById({
          projectId: sourceProjectId,
          assetId,
        });
        if (!asset)
          throw new ScopeError(
            'SCOPE_MISMATCH',
            'Publish requires a source-episode Asset.',
          );
        await assertSharedMediaAvailable(asset);
        await db
          .insert(seriesAssetMembership)
          .values({
            id: `${input.seriesId}:${assetId}`,
            seriesId: input.seriesId,
            assetId,
            sourceProjectId,
            publishedAt: Date.now(),
            archivedAt: null,
            provenance: { sourceProjectId },
          })
          .onConflictDoNothing();
        return asset;
      }
      if (command.type === 'publish_assets')
        for (const id of command.assetIds)
          await publish(id, command.sourceProjectId);
      else if (command.type === 'archive_assets') {
        for (const assetId of command.assetIds)
          await db
            .update(seriesAssetMembership)
            .set({ archivedAt: command.archived ? Date.now() : null })
            .where(
              and(
                eq(seriesAssetMembership.seriesId, input.seriesId),
                eq(seriesAssetMembership.assetId, assetId),
              ),
            );
      } else if (command.type === 'use_assets') {
        await requireEpisode(input.seriesId, command.projectId);
        for (const assetId of command.assetIds) {
          const [member] = await db
            .select()
            .from(seriesAssetMembership)
            .where(
              and(
                eq(seriesAssetMembership.seriesId, input.seriesId),
                eq(seriesAssetMembership.assetId, assetId),
              ),
            )
            .limit(1);
          if (!member || member.archivedAt)
            throw new ScopeError(
              'SCOPE_MISMATCH',
              'Shared media is unavailable.',
            );
          const [asset] = await db
            .select()
            .from(userAsset)
            .where(eq(userAsset.id, assetId))
            .limit(1);
          if (!asset) throw new ScopeError('NOT_FOUND', 'Media not found.');
          await assertSharedMediaAvailable(asset);
          await linkProjectAsset({
            projectId: command.projectId,
            assetId,
            role: 'reference',
            metadata: {
              sharedFrom: {
                seriesId: input.seriesId,
                sourceProjectId: member.sourceProjectId,
              },
            },
          });
        }
      } else if (command.type === 'publish_element') {
        const [count] = await db
          .select({ count: sql<number>`count(*)` })
          .from(seriesElement)
          .where(eq(seriesElement.seriesId, input.seriesId));
        if (Number(count.count) >= 256)
          throw new ScopeError(
            'CAPACITY_EXCEEDED',
            'Series Element limit reached (256).',
          );
        const asset = await publish(command.assetId, command.sourceProjectId);
        if (asset.type !== (command.kind === 'voice' ? 'audio' : 'image'))
          throw new ScopeError(
            'INVALID_COMMAND',
            'Element media type does not match its kind.',
          );
        if (command.sourceElementId || command.sourceVersionId) {
          const { getOrganization } =
            await import('@/core/organization/service');
          const source = (await getOrganization(command.sourceProjectId))
            .document.elements[command.sourceElementId ?? ''];
          if (
            !source ||
            source.versions[command.sourceVersionId ?? '']?.assetId !==
              command.assetId
          )
            throw new ScopeError(
              'SCOPE_MISMATCH',
              'Source Element version changed.',
            );
        }
        await db.insert(seriesElement).values({
          id: command.elementId,
          seriesId: input.seriesId,
          name: command.name,
          kind: command.kind,
          currentVersionId: command.versionId,
          description: '',
          archivedAt: null,
        });
        await db.insert(seriesElementVersion).values({
          id: command.versionId,
          elementId: command.elementId,
          assetId: command.assetId,
          ordinal: 1,
          sourceProjectId: command.sourceProjectId,
          sourceElementId: command.sourceElementId ?? null,
          sourceVersionId: command.sourceVersionId ?? null,
          createdAt: Date.now(),
          note: '',
        });
      } else {
        const [element] = await db
          .select()
          .from(seriesElement)
          .where(
            and(
              eq(seriesElement.id, command.elementId),
              eq(seriesElement.seriesId, input.seriesId),
            ),
          )
          .limit(1);
        if (!element)
          throw new ScopeError('NOT_FOUND', 'Shared Element not found.');
        if (command.type === 'archive_element')
          await db
            .update(seriesElement)
            .set({ archivedAt: command.archived ? Date.now() : null })
            .where(eq(seriesElement.id, element.id));
        else if (command.type === 'set_current') {
          if (element.currentVersionId !== command.observedCurrentVersionId)
            throw new ScopeError(
              'PREVIEW_STALE',
              'Recommended version changed.',
            );
          const [version] = await db
            .select()
            .from(seriesElementVersion)
            .where(
              and(
                eq(seriesElementVersion.id, command.versionId),
                eq(seriesElementVersion.elementId, element.id),
              ),
            )
            .limit(1);
          if (!version)
            throw new ScopeError(
              'SCOPE_MISMATCH',
              'Version belongs to another Element.',
            );
          await db
            .update(seriesElement)
            .set({ currentVersionId: command.versionId })
            .where(eq(seriesElement.id, element.id));
        } else {
          if (element.archivedAt)
            throw new ScopeError(
              'SCOPE_MISMATCH',
              'Restore the Element first.',
            );
          const asset = await publish(command.assetId, command.sourceProjectId);
          if (asset.type !== (element.kind === 'voice' ? 'audio' : 'image'))
            throw new ScopeError(
              'INVALID_COMMAND',
              'Element media type mismatch.',
            );
          const versions = await db
            .select()
            .from(seriesElementVersion)
            .where(eq(seriesElementVersion.elementId, element.id));
          if (versions.length >= 100)
            throw new ScopeError(
              'CAPACITY_EXCEEDED',
              'Element version limit reached.',
            );
          await db.insert(seriesElementVersion).values({
            id: command.versionId,
            elementId: element.id,
            assetId: command.assetId,
            ordinal: versions.length + 1,
            sourceProjectId: command.sourceProjectId,
            createdAt: Date.now(),
            note: command.note ?? '',
          });
        }
      }
      await db
        .update(series)
        .set({ revision: state.revision + 1, updatedAt: Date.now() })
        .where(eq(series.id, input.seriesId));
      return getSharedLibrary(input.seriesId);
    },
  );
}

export async function syncSeriesConsumers(
  projectId: string,
  canvasId: string,
  document: ProjectSnapshotDocument,
) {
  const db = await getDb();
  await db
    .delete(seriesReferenceConsumer)
    .where(
      and(
        eq(seriesReferenceConsumer.projectId, projectId),
        eq(seriesReferenceConsumer.canvasId, canvasId),
      ),
    );
  for (const binding of Object.values(
    document.organization?.elementBindings ?? {},
  )) {
    if (binding.scope !== 'series' || !binding.ownerId) continue;
    await db.insert(seriesReferenceConsumer).values({
      id: `${projectId}:${canvasId}:${binding.id}`,
      seriesId: binding.ownerId,
      elementId: binding.elementId,
      versionId: binding.versionId,
      projectId,
      canvasId,
      bindingId: binding.id,
      consumerCardId: binding.consumerCardId,
    });
  }
}
