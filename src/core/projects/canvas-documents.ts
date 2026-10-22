import { and, eq, inArray } from 'drizzle-orm';
import {
  project,
  projectCanvasDocument,
  projectCanvasCardLocator,
  projectCanvasState,
} from '@/config/db/schema';
import { getDb } from '@/core/workspace-lib/db-adapter';
import { defaultCanvasId } from './canvas-identity';
import { getCanvasEntry } from '@/core/series/narrative';
import { ScopeError } from '@/core/series/contracts';
import {
  isDestructiveEmptyProjectSnapshot,
  normalizeProjectSnapshotDocument,
  type ProjectSnapshotDocument,
} from './project-snapshot';

export async function updateCanvasLocators(
  projectId: string,
  canvasId: string,
  document: ProjectSnapshotDocument,
  allowRestoreDeleted = false,
) {
  const db = await getDb();
  const ids = document.cards.map((c) => c.id);
  const previous = await db
    .select()
    .from(projectCanvasCardLocator)
    .where(
      and(
        eq(projectCanvasCardLocator.projectId, projectId),
        eq(projectCanvasCardLocator.canvasId, canvasId),
      ),
    );
  const current = ids.length
    ? await db
        .select()
        .from(projectCanvasCardLocator)
        .where(
          and(
            eq(projectCanvasCardLocator.projectId, projectId),
            inArray(projectCanvasCardLocator.cardId, ids),
          ),
        )
    : [];
  if (canvasId !== defaultCanvasId(projectId)) {
    const [legacy] = await db
      .select()
      .from(projectCanvasState)
      .where(eq(projectCanvasState.projectId, projectId))
      .limit(1);
    const oldIds = new Set(
      normalizeProjectSnapshotDocument(legacy?.documentJson).cards.map(
        (c) => c.id,
      ),
    );
    if (ids.some((id) => oldIds.has(id)))
      throw new ScopeError(
        'SCOPE_MISMATCH',
        'Card ID already belongs to the project Canvas.',
      );
  }
  for (const row of current) {
    if ((row.deleted && !allowRestoreDeleted) || row.canvasId !== canvasId)
      throw new ScopeError(
        'SCOPE_MISMATCH',
        'Card ID belongs to another Canvas or was retired. Use the explicit transfer operation.',
      );
  }
  for (const row of previous)
    if (!ids.includes(row.cardId))
      await db
        .update(projectCanvasCardLocator)
        .set({ deleted: 1 })
        .where(eq(projectCanvasCardLocator.id, row.id));
  for (const cardId of ids)
    await db
      .insert(projectCanvasCardLocator)
      .values({
        id: `${projectId}:${cardId}`,
        projectId,
        cardId,
        canvasId,
        previousCanvasIds: [],
        deleted: 0,
      })
      .onConflictDoUpdate({
        target: projectCanvasCardLocator.id,
        set: { deleted: 0 },
      });
}

export async function saveSceneCanvasSnapshot(input: {
  projectId: string;
  canvasId: string;
  document: ProjectSnapshotDocument;
  baseVersion?: number | null;
  allowEmpty?: boolean;
  allowArchivedCanvas?: boolean;
  allowRestoreDeleted?: boolean;
}) {
  const entry = await getCanvasEntry(
    input.projectId,
    input.canvasId,
    input.allowArchivedCanvas,
  );
  if (entry.storageKind !== 'document')
    throw new ScopeError('SCOPE_MISMATCH', 'Expected a scene Canvas.');
  if (
    !Number.isSafeInteger(input.baseVersion) ||
    entry.version !== input.baseVersion
  ) {
    const error = Object.assign(
      new Error('Project snapshot version conflict'),
      { name: 'ProjectSnapshotVersionConflict', currentVersion: entry.version },
    );
    throw error;
  }
  const document = normalizeProjectSnapshotDocument(input.document);
  const previous = normalizeProjectSnapshotDocument(entry.documentJson);
  if (previous.version === 5 && input.document.version !== 5)
    throw new ScopeError(
      'CAPABILITY_REQUIRED',
      'Reload with the current v5 client before saving.',
    );
  if (
    isDestructiveEmptyProjectSnapshot({ previous, next: document }) &&
    !input.allowEmpty
  )
    throw new Error('Unconfirmed empty Canvas snapshot rejected.');
  const { validateOrganizationBindings } =
    await import('@/core/organization/service');
  await validateOrganizationBindings(input.projectId, document);
  if (JSON.stringify(previous) === JSON.stringify(document))
    return { version: entry.version! };
  const db = await getDb();
  await updateCanvasLocators(
    input.projectId,
    input.canvasId,
    document,
    input.allowRestoreDeleted,
  );
  const rows = await db
    .update(projectCanvasDocument)
    .set({ documentJson: document, version: entry.version! + 1 })
    .where(
      and(
        eq(projectCanvasDocument.id, entry.id),
        eq(projectCanvasDocument.version, input.baseVersion!),
      ),
    )
    .returning({ version: projectCanvasDocument.version });
  if (!rows.length)
    throw Object.assign(new Error('Project snapshot version conflict'), {
      name: 'ProjectSnapshotVersionConflict',
      currentVersion: entry.version,
    });
  await db
    .update(project)
    .set({ updatedAt: new Date(), lastOpenedAt: new Date() })
    .where(eq(project.id, input.projectId));
  return { version: rows[0].version! };
}
