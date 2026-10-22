import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  generationUploadIntent,
  generationHistory,
  projectCanvasCardLocator,
} from '@/config/db/schema';
import { getDb } from '@/core/workspace-lib/db-adapter';
import {
  loadProjectWithLatestSnapshot,
  saveProjectSnapshot,
} from '@/core/projects/projects';
import {
  normalizeProjectSnapshotDocument,
  type ProjectSnapshotDocument,
} from '@/core/projects/project-snapshot';
import { normalizeCanvasOrganization } from '@/core/organization/canvas-organization';
import { persistScopedWrite } from '@/core/commands/scoped-write';
import { getNarrative } from './narrative';
import { ScopeError, stableId } from './contracts';
import {
  assertPreviewToken,
  createPreviewToken,
  readPreviewToken,
} from './preview';

const requestSchema = z
  .object({
    projectId: stableId,
    sourceCanvasId: stableId,
    targetCanvasId: stableId,
    selectedCardIds: z.array(stableId).min(1).max(200),
    includeDependencies: z.boolean().default(false),
  })
  .strict();
export type TransferRequest = z.input<typeof requestSchema>;

export function transferDocuments(
  source: ProjectSnapshotDocument,
  target: ProjectSnapshotDocument,
  selected: string[],
  includeDependencies: boolean,
) {
  const sourceOrg = normalizeCanvasOrganization(source.organization);
  const targetOrg = normalizeCanvasOrganization(target.organization);
  const known = new Set(source.cards.map((c) => c.id));
  const closure = new Set(selected);
  if (selected.some((id) => !known.has(id)))
    throw new ScopeError('NOT_FOUND', 'Selected source card is missing.');
  let changed = true;
  while (changed) {
    const before = closure.size;
    const connect = (ids: string[]) => {
      if (ids.some((id) => closure.has(id)))
        for (const id of ids) if (known.has(id)) closure.add(id);
    };
    for (const card of source.cards)
      connect([
        card.id,
        ...card.referenceCardIds,
        ...(card.sourceConfigCardId ? [card.sourceConfigCardId] : []),
      ]);
    for (const group of Object.values(sourceOrg.groups))
      connect(group.memberCardIds);
    for (const instance of Object.values(sourceOrg.templateInstances))
      connect([
        ...Object.values(instance.stepCardIds),
        ...Object.values(instance.slotBindings).map((b) => b.referenceCardId),
      ]);
    changed = before !== closure.size;
  }
  const additional = [...closure].filter((id) => !selected.includes(id));
  const blockers: string[] = [];
  if (additional.length && !includeDependencies)
    blockers.push(
      'The selection has linked inputs, consumers, groups or template steps. Preview again with the complete dependency set.',
    );
  if (
    source.cards.some(
      (c) =>
        closure.has(c.id) &&
        (c.status === 'pending' || c.status === 'processing'),
    )
  )
    blockers.push(
      'Selected source cards still have pending or running generation. Wait for completion first.',
    );
  if (target.cards.some((c) => closure.has(c.id)))
    blockers.push('Target Canvas already contains a selected card ID.');
  const nextSource = structuredClone(source);
  const nextTarget = structuredClone(target);
  nextSource.organization = sourceOrg;
  nextTarget.organization = targetOrg;
  nextSource.cards = source.cards.filter((c) => !closure.has(c.id));
  nextSource.frames = Object.fromEntries(
    Object.entries(source.frames).filter(([id]) => !closure.has(id)),
  );
  nextTarget.cards.push(...source.cards.filter((c) => closure.has(c.id)));
  const targetRight = Math.max(
    0,
    ...Object.values(target.frames).map((f) => f.x + f.w),
  );
  const sourceLeft = Math.min(
    0,
    ...[...closure].map((id) => source.frames[id]?.x ?? 0),
  );
  const dx = targetRight + 160 - sourceLeft;
  for (const id of closure)
    if (source.frames[id])
      nextTarget.frames[id] = {
        ...source.frames[id],
        x: source.frames[id].x + dx,
      };
  for (const [id, group] of Object.entries(sourceOrg.groups))
    if (group.memberCardIds.some((c) => closure.has(c))) {
      if (targetOrg.groups[id])
        blockers.push('Target Canvas already contains a selected group ID.');
      targetOrg.groups[id] = {
        ...group,
        summaryFrame: { ...group.summaryFrame, x: group.summaryFrame.x + dx },
        expandedFrame: {
          ...group.expandedFrame,
          x: group.expandedFrame.x + dx,
        },
      };
      delete sourceOrg.groups[id];
    }
  for (const [id, binding] of Object.entries(sourceOrg.elementBindings))
    if (closure.has(binding.consumerCardId)) {
      if (targetOrg.elementBindings[id])
        blockers.push('Target Canvas already contains a binding ID.');
      targetOrg.elementBindings[id] = binding;
      delete sourceOrg.elementBindings[id];
    }
  for (const [id, instance] of Object.entries(sourceOrg.templateInstances))
    if (Object.values(instance.stepCardIds).some((c) => closure.has(c))) {
      if (targetOrg.templateInstances[id])
        blockers.push('Target Canvas already contains a template instance ID.');
      targetOrg.templateInstances[id] = instance;
      delete sourceOrg.templateInstances[id];
    }
  try {
    normalizeProjectSnapshotDocument(nextSource);
    normalizeProjectSnapshotDocument(nextTarget);
  } catch (error) {
    blockers.push(
      error instanceof Error ? error.message : 'Target capacity exceeded.',
    );
  }
  return {
    source: nextSource,
    target: nextTarget,
    closure: [...closure].sort(),
    additional: additional.sort(),
    blockers,
  };
}
export async function previewCanvasTransfer(
  input: TransferRequest,
  issuedAt = Date.now(),
) {
  const request = requestSchema.parse(input);
  if (request.sourceCanvasId === request.targetCanvasId)
    throw new ScopeError('INVALID_COMMAND', 'Choose another target Canvas.');
  const [source, target, narrative] = await Promise.all([
    loadProjectWithLatestSnapshot({
      projectId: request.projectId,
      canvasId: request.sourceCanvasId,
    }),
    loadProjectWithLatestSnapshot({
      projectId: request.projectId,
      canvasId: request.targetCanvasId,
    }),
    getNarrative(request.projectId),
  ]);
  if (!source || !target)
    throw new ScopeError('NOT_FOUND', 'Project not found.');
  const draft = transferDocuments(
    source.snapshot,
    target.snapshot,
    request.selectedCardIds,
    request.includeDependencies,
  );
  const db = await getDb();
  const intents = draft.closure.length
    ? await db
        .select({ id: generationUploadIntent.id })
        .from(generationUploadIntent)
        .where(
          and(
            eq(generationUploadIntent.projectId, request.projectId),
            inArray(generationUploadIntent.sourceCardId, draft.closure),
            gt(generationUploadIntent.expiresAt, new Date()),
            isNull(generationUploadIntent.consumedAt),
          ),
        )
    : [];
  if (intents.length)
    draft.blockers.push(
      'Selected cards have an unexpired generation precheck. Complete or let it expire before moving.',
    );
  const activeJobs: { id: string }[] = draft.closure.length ? await db.select({ id: generationHistory.id }).from(generationHistory).where(and(eq(generationHistory.projectId, request.projectId), inArray(generationHistory.status, ['pending', 'processing', 'queued', 'running']), inArray(sql<string>`json_extract(${generationHistory.input}, '$._source.canvasSource.sourceCardId')`, draft.closure))) : [];
  if (activeJobs.length) draft.blockers.push('Selected cards have running generation jobs. Wait for completion before moving.');
  const observed = {
    sourceRevision: source.snapshotVersion,
    targetRevision: target.snapshotVersion,
    narrativeRevision: narrative.revision,
    source: source.snapshot,
    target: target.snapshot,
    activeJobIds: activeJobs.map(job => job.id).sort(),
    intentIds: intents.map((i: any) => i.id).sort(),
    closure: draft.closure,
    blockers: draft.blockers,
  };
  return {
    request,
    sourceRevision: source.snapshotVersion,
    targetRevision: target.snapshotVersion,
    narrativeRevision: narrative.revision,
    cardIds: draft.closure,
    additionalCardIds: draft.additional,
    blockers: draft.blockers,
    previewToken: createPreviewToken(
      'canvas.transfer',
      request,
      observed,
      issuedAt,
    ),
    expiresAt: issuedAt + 600_000,
    // Server-only working documents; HTTP/MCP callers strip these fields.
    documents: { source: draft.source, target: draft.target },
    observed,
  };
}
export async function applyCanvasTransfer(input: {
  projectId: string;
  commandId: string;
  idempotencyKey: string;
  expectedRevision: number;
  previewToken: string;
  origin?: 'ui' | 'mcp';
}) {
  return persistScopedWrite(
    {
      ...input,
      scope: 'project',
      scopeId: input.projectId,
      command: { type: 'canvas.transfer', previewToken: input.previewToken },
    },
    async () => {
      const token = readPreviewToken(input.previewToken, 'canvas.transfer');
      const request = requestSchema.parse(token.request);
      if (request.projectId !== input.projectId)
        throw new ScopeError(
          'SCOPE_MISMATCH',
          'Transfer belongs to another project.',
        );
      const preview = await previewCanvasTransfer(request, token.issuedAt);
      assertPreviewToken(
        input.previewToken,
        'canvas.transfer',
        preview.request,
        preview.observed,
      );
      if (input.expectedRevision !== preview.sourceRevision)
        throw new ScopeError(
          'REVISION_CONFLICT',
          'Source Canvas changed.',
          preview.sourceRevision,
        );
      if (preview.blockers.length)
        throw new ScopeError('DEPENDENCY_BLOCKED', preview.blockers.join(' '));
      const db = await getDb();
      await saveProjectSnapshot({
        projectId: input.projectId,
        canvasId: request.sourceCanvasId,
        document: preview.documents.source,
        baseVersion: preview.sourceRevision,
        allowEmpty: true,
      });
      for (const cardId of preview.cardIds) {
        const [old] = await db
          .select()
          .from(projectCanvasCardLocator)
          .where(
            and(
              eq(projectCanvasCardLocator.projectId, input.projectId),
              eq(projectCanvasCardLocator.cardId, cardId),
            ),
          )
          .limit(1);
        const row = {
          id: `${input.projectId}:${cardId}`,
          projectId: input.projectId,
          cardId,
          canvasId: request.targetCanvasId,
          previousCanvasIds: [
            ...new Set([
              ...(old?.previousCanvasIds ?? []),
              request.sourceCanvasId,
            ]),
          ].slice(-32),
          deleted: 0,
        };
        await db
          .insert(projectCanvasCardLocator)
          .values(row)
          .onConflictDoUpdate({
            target: projectCanvasCardLocator.id,
            set: row,
          });
      }
      const result = await saveProjectSnapshot({
        projectId: input.projectId,
        canvasId: request.targetCanvasId,
        document: preview.documents.target,
        baseVersion: preview.targetRevision,
      });
      return {
        projectId: input.projectId,
        sourceCanvasId: request.sourceCanvasId,
        targetCanvasId: request.targetCanvasId,
        sourceRevision: preview.sourceRevision + 1,
        targetRevision: result.version,
        cardIds: preview.cardIds,
      };
    },
  );
}
