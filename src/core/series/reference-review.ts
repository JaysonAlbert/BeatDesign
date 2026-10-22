import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  series,
  seriesElement,
  seriesElementVersion,
  userAsset,
  seriesEpisode,
  seriesReferenceConsumer,
} from '@/config/db/schema';
import { getDb } from '@/core/workspace-lib/db-adapter';
import {
  loadProjectWithLatestSnapshot,
  saveProjectSnapshot,
} from '@/core/projects/projects';
import {
  buildLocalProjectAssetUrl,
  LOCAL_PROJECT_ASSET_PROVIDER,
} from '@/core/projects/local-project-assets';
import { buildTextCard } from '@/core/beatcanvas/text-nodes';
import {
  normalizeProjectSnapshotDocument,
  type ProjectSnapshotDocument,
} from '@/core/projects/project-snapshot';
import { normalizeCanvasOrganization } from '@/core/organization/canvas-organization';
import {
  getOrganization,
  saveOrganizationDocument,
} from '@/core/organization/service';
import {
  normalizeOrganizationDocument,
  type ProjectOrganizationDocument,
  type ReusableElement,
} from '@/core/organization/organization-document';
import { persistScopedWrite } from '@/core/commands/scoped-write';
import {
  checkRevision,
  fingerprint,
  ScopeError,
  seriesLimits,
  stableId,
} from './contracts';
import { getSeries, requireEpisode } from './service';
import { resolveElementReference } from './shared-assets';
import { bumpNarrative, getNarrative } from './narrative';
import {
  assertPreviewToken,
  createPreviewToken,
  readPreviewToken,
} from './preview';

const consumerSchema = z
  .object({ projectId: stableId, canvasId: stableId, bindingId: stableId })
  .strict();
const requestSchema = z
  .object({
    seriesId: stableId,
    mode: z.enum(['adopt', 'keep', 'localize', 'detach']),
    elementId: stableId.optional(),
    targetVersionId: stableId.optional(),
    projectId: stableId.optional(),
    selectedConsumers: z.array(consumerSchema).max(100).default([]),
  })
  .strict();
export type ReferenceReviewRequest = z.input<typeof requestSchema>;
type Group = {
  projectId: string;
  canvasId: string;
  revision: number;
  document: ProjectSnapshotDocument;
  next: ProjectSnapshotDocument;
  bindingIds: string[];
};
export async function previewReferenceReview(
  input: ReferenceReviewRequest,
  issuedAt = Date.now(),
) {
  const request = requestSchema.parse(input);
  const state = await getSeries(request.seriesId);
  if (!state || (state.archivedAt && request.mode === 'adopt'))
    throw new ScopeError(
      'NOT_FOUND',
      'Series is unavailable for this operation.',
    );
  const db = await getDb();
  let consumers = request.selectedConsumers;
  let narrativeRevision: number | null = null;
  if (request.mode === 'detach') {
    if (!request.projectId)
      throw new ScopeError(
        'INVALID_COMMAND',
        'Detach requires an episode Project.',
      );
    await requireEpisode(request.seriesId, request.projectId, true);
    const rows: (typeof seriesReferenceConsumer.$inferSelect)[] = await db
      .select()
      .from(seriesReferenceConsumer)
      .where(
        and(
          eq(seriesReferenceConsumer.seriesId, request.seriesId),
          eq(seriesReferenceConsumer.projectId, request.projectId),
        ),
      );
    consumers = rows.map((c) => ({
      projectId: c.projectId,
      canvasId: c.canvasId,
      bindingId: c.bindingId,
    }));
    narrativeRevision = (await getNarrative(request.projectId)).revision;
  }
  if (consumers.length > seriesLimits.adoptionConsumers)
    throw new ScopeError(
      'CAPACITY_EXCEEDED',
      'Localize references in explicit batches before detaching this episode.',
    );
  if (!consumers.length && request.mode !== 'detach')
    throw new ScopeError(
      'INVALID_COMMAND',
      'Choose at least one exact consumer.',
    );
  const keys = consumers.map((c) =>
    JSON.stringify([c.projectId, c.canvasId, c.bindingId]),
  );
  if (new Set(keys).size !== keys.length)
    throw new ScopeError('INVALID_COMMAND', 'Duplicate consumer.');
  const groups = new Map<string, Group>();
  const organizations = new Map<
    string,
    {
      revision: number;
      original: ProjectOrganizationDocument;
      next: ProjectOrganizationDocument;
    }
  >();
  const changes: {
    projectId: string;
    canvasId: string;
    bindingId: string;
    consumerCardId: string;
    fromVersionId: string;
    toVersionId: string;
    assetId: string;
    elementId: string;
  }[] = [];
  const blockers: string[] = [];
  for (const consumer of consumers.sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b)),
  )) {
    await requireEpisode(
      request.seriesId,
      consumer.projectId,
      request.mode !== 'adopt',
    );
    const key = JSON.stringify([consumer.projectId, consumer.canvasId]);
    if (!groups.has(key)) {
      if (groups.size >= seriesLimits.adoptionCanvases)
        throw new ScopeError(
          'CAPACITY_EXCEEDED',
          'Review at most 20 canvases per batch. Localize in smaller batches first.',
        );
      const canvas = await loadProjectWithLatestSnapshot({
        ...consumer,
        allowArchivedCanvas: request.mode !== 'adopt',
      });
      if (!canvas)
        throw new ScopeError('NOT_FOUND', 'Consumer Project is unavailable.');
      groups.set(key, {
        ...consumer,
        revision: canvas.snapshotVersion,
        document: canvas.snapshot,
        next: structuredClone(canvas.snapshot),
        bindingIds: [],
      });
    }
    const group = groups.get(key)!;
    group.bindingIds.push(consumer.bindingId);
    group.next.organization = normalizeCanvasOrganization(
      group.next.organization,
    );
    const binding = group.next.organization.elementBindings[consumer.bindingId];
    if (
      !binding ||
      binding.scope !== 'series' ||
      binding.ownerId !== request.seriesId ||
      (request.elementId && request.elementId !== binding.elementId)
    )
      throw new ScopeError(
        'SCOPE_MISMATCH',
        'Consumer no longer uses this shared Element.',
      );
    const originalVersionId = binding.versionId;
    const element = await resolveElementReference(consumer.projectId, binding);
    let nextElementId = binding.elementId;
    let nextVersionId = binding.versionId;
    let nextAssetId = binding.assetId;
    if (request.mode === 'adopt') {
      if (!request.elementId || !request.targetVersionId)
        throw new ScopeError(
          'INVALID_COMMAND',
          'Adoption requires an Element and exact target version.',
        );
      if (element.currentVersionId !== request.targetVersionId)
        throw new ScopeError(
          'PREVIEW_STALE',
          'The recommended version changed.',
        );
      const version = element.versions[request.targetVersionId];
      if (!version)
        throw new ScopeError(
          'SCOPE_MISMATCH',
          'Target version is unavailable.',
        );
      nextVersionId = version.id;
      nextAssetId = version.assetId;
      await resolveElementReference(
        consumer.projectId,
        { ...binding, versionId: nextVersionId, assetId: nextAssetId },
        { forNewUse: true, checkFile: true, preview: true },
      );
      const referenceCardId =
        nextAssetId === binding.assetId
          ? binding.referenceCardId
          : `shared:${fingerprint([consumer.projectId, consumer.canvasId, binding.elementId, nextVersionId]).slice(0, 32)}`;
      if (!group.next.cards.some((c) => c.id === referenceCardId)) {
        const [asset] = await db
          .select()
          .from(userAsset)
          .where(eq(userAsset.id, nextAssetId))
          .limit(1);
        const bottom = Math.max(
          0,
          ...Object.values(group.next.frames).map((f) => f.y + f.h),
        );
        group.next.cards.push({
          ...buildTextCard({
            id: referenceCardId,
            name: `${element.name} · ${nextVersionId}`,
          }),
          kind: 'asset',
          type: asset.type,
          assetId: nextAssetId,
          url:
            asset.storageProvider === LOCAL_PROJECT_ASSET_PROVIDER
              ? buildLocalProjectAssetUrl({
                  projectId: consumer.projectId,
                  assetId: nextAssetId,
                })
              : asset.publicUrl,
        } as ProjectSnapshotDocument['cards'][number]);
        group.next.frames[referenceCardId] = {
          x: 0,
          y: bottom + 96,
          w: 320,
          h: 220,
        };
      }
      const card = group.next.cards.find(
        (c) => c.id === binding.consumerCardId,
      );
      if (
        !card ||
        card.referenceCardIds[binding.order] !== binding.referenceCardId
      )
        throw new ScopeError(
          'SCOPE_MISMATCH',
          'Actual input no longer matches the binding.',
        );
      card.referenceCardIds[binding.order] = referenceCardId;
      binding.referenceCardId = referenceCardId;
    } else if (request.mode === 'keep') {
      if (
        !request.targetVersionId ||
        request.targetVersionId !== element.currentVersionId
      )
        throw new ScopeError(
          'PREVIEW_STALE',
          'The reviewed recommendation changed.',
        );
    } else {
      if (!organizations.has(consumer.projectId)) {
        const org = await getOrganization(consumer.projectId);
        organizations.set(consumer.projectId, {
          revision: org.revision,
          original: org.document,
          next: structuredClone(org.document),
        });
      }
      const org = organizations.get(consumer.projectId)!;
      nextElementId = `local:${fingerprint([request.seriesId, binding.elementId]).slice(0, 32)}`;
      nextVersionId = `local:${fingerprint([request.seriesId, binding.elementId, binding.versionId]).slice(0, 32)}`;
      let local = org.next.elements[nextElementId];
      if (
        local &&
        (local.seriesSource?.seriesId !== request.seriesId ||
          local.seriesSource.elementId !== binding.elementId)
      )
        throw new ScopeError(
          'SCOPE_MISMATCH',
          'Local Element identity is occupied.',
        );
      if (!local)
        local = {
          id: nextElementId,
          name: element.name,
          kind: element.kind,
          description: element.description,
          versions: {},
          currentVersionId: nextVersionId,
          deletedAt: null,
          seriesSource: {
            seriesId: request.seriesId,
            elementId: binding.elementId,
            versionIds: {},
          },
        };
      local.versions[nextVersionId] = {
        ...element.versions[binding.versionId],
        id: nextVersionId,
      };
      local.seriesSource!.versionIds[nextVersionId] = binding.versionId;
      org.next.elements[nextElementId] = local;
      binding.scope = 'project';
      binding.ownerId = consumer.projectId;
    }
    binding.elementId = nextElementId;
    binding.versionId = nextVersionId;
    binding.assetId = nextAssetId;
    binding.reviewedAgainstCurrentVersionId =
      request.mode === 'keep' ? request.targetVersionId! : nextVersionId;
    changes.push({
      ...consumer,
      consumerCardId: binding.consumerCardId,
      fromVersionId: originalVersionId,
      toVersionId: nextVersionId,
      assetId: nextAssetId,
      elementId: nextElementId,
    });
  }
  for (const group of groups.values()) {
    if (request.mode === 'keep') continue;
    for (const instance of Object.values(
      group.next.organization?.templateInstances ?? {},
    ))
      for (const [slotId, slotBinding] of Object.entries(
        instance.slotBindings,
      )) {
        if (
          slotBinding.scope !== 'series' ||
          slotBinding.ownerId !== request.seriesId
        )
          continue;
        const slot = instance.slotDefinitions.find((s) => s.id === slotId)!;
        const ids = slot.consumers.map(
          (c) => `${instance.id}:${slotId}:${c.stepId}`,
        );
        if (!ids.some((id) => group.bindingIds.includes(id))) continue;
        if (!ids.every((id) => group.bindingIds.includes(id))) {
          blockers.push(
            'A shared template slot affects multiple steps. Select all of its consumers together.',
          );
          continue;
        }
        const selected = group.next.organization!.elementBindings[ids[0]];
        instance.slotBindings[slotId] = {
          ...slotBinding,
          scope: selected.scope,
          ownerId: selected.ownerId,
          elementId: selected.elementId,
          versionId: selected.versionId,
          assetId: selected.assetId,
          referenceCardId: selected.referenceCardId,
        };
      }
    try {
      group.next = normalizeProjectSnapshotDocument(group.next);
    } catch (error) {
      blockers.push(
        error instanceof Error ? error.message : 'Canvas capacity exceeded.',
      );
    }
  }
  for (const org of organizations.values())
    try {
      org.next = normalizeOrganizationDocument(org.next);
    } catch (error) {
      blockers.push(
        error instanceof Error
          ? error.message
          : 'Project Element capacity exceeded.',
      );
    }
  const observed = {
    seriesRevision: state.revision,
    narrativeRevision,
    changes,
    groups: [...groups.values()],
    organizations: [...organizations.entries()],
    blockers,
  };
  return {
    request,
    seriesRevision: state.revision,
    narrativeRevision,
    changes,
    blockers,
    previewToken: createPreviewToken(
      'references.review',
      request,
      observed,
      issuedAt,
    ),
    expiresAt: issuedAt + 600_000,
    groups: [...groups.values()],
    organizations: [...organizations.entries()],
    observed,
  };
}

export async function applyReferenceReview(input: {
  seriesId: string;
  commandId: string;
  idempotencyKey: string;
  expectedRevision: number;
  previewToken: string;
  origin?: 'ui' | 'mcp';
}) {
  return persistScopedWrite(
    {
      ...input,
      scope: 'series',
      scopeId: input.seriesId,
      command: { type: 'references.review', previewToken: input.previewToken },
    },
    async () => {
      const token = readPreviewToken(input.previewToken, 'references.review');
      const request = requestSchema.parse(token.request);
      if (request.seriesId !== input.seriesId)
        throw new ScopeError(
          'SCOPE_MISMATCH',
          'Preview belongs to another Series.',
        );
      const preview = await previewReferenceReview(request, token.issuedAt);
      assertPreviewToken(
        input.previewToken,
        'references.review',
        preview.request,
        preview.observed,
      );
      checkRevision(preview.seriesRevision, input.expectedRevision);
      if (preview.blockers.length)
        throw new ScopeError('DEPENDENCY_BLOCKED', preview.blockers.join(' '));
      for (const group of preview.groups)
        for (const bindingId of group.bindingIds) {
          const binding = group.next.organization!.elementBindings[bindingId];
          if (request.mode === 'adopt')
            await resolveElementReference(group.projectId, binding, {
              forNewUse: true,
              grant: true,
              checkFile: true,
            });
        }
      for (const [projectId, org] of preview.organizations)
        await saveOrganizationDocument(projectId, org.next, org.revision);
      const revisions: {
        projectId: string;
        canvasId: string;
        revision: number;
      }[] = [];
      for (const group of preview.groups) {
        const saved = await saveProjectSnapshot({
          projectId: group.projectId,
          canvasId: group.canvasId,
          document: group.next,
          baseVersion: group.revision,
          allowArchivedCanvas: request.mode !== 'adopt',
        });
        revisions.push({
          projectId: group.projectId,
          canvasId: group.canvasId,
          revision: saved.version,
        });
      }
      const db = await getDb();
      if (request.mode === 'detach') {
        await db
          .delete(seriesEpisode)
          .where(
            and(
              eq(seriesEpisode.seriesId, input.seriesId),
              eq(seriesEpisode.projectId, request.projectId!),
            ),
          );
        await bumpNarrative(request.projectId!, preview.narrativeRevision!);
      }
      await db
        .update(series)
        .set({ revision: preview.seriesRevision + 1, updatedAt: Date.now() })
        .where(eq(series.id, input.seriesId));
      return {
        seriesId: input.seriesId,
        revision: preview.seriesRevision + 1,
        changes: preview.changes,
        canvases: revisions,
        detachedProjectId: request.mode === 'detach' ? request.projectId : null,
      };
    },
  );
}
