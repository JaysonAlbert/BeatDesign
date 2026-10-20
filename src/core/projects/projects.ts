import { withDatabaseTransaction } from '@/core/db/transaction-context';
import { scopedCanvasId } from './canvas-scope';
import { defaultCanvasId } from './canvas-identity';
import { getCanvasEntry } from '@/core/series/narrative';
import { saveSceneCanvasSnapshot, updateCanvasLocators } from './canvas-documents';

import { randomUUID } from 'crypto';
import { resolveProjectCover } from './project-settings';
import { getDb } from '@/core/workspace-lib/db-adapter';
import { project, projectCanvasState } from '@/config/db/schema';
import {
  type ProjectSnapshotDocument,
  createEmptyProjectSnapshot,
  hasProjectSnapshotVersionConflict,
  isDestructiveEmptyProjectSnapshot,
  normalizeProjectSnapshotDocument,
} from '@/core/projects/project-snapshot';
import { and, desc, eq } from 'drizzle-orm';
import {
  defaultWorkspaceMode,
  resolveWorkspaceMode,
  type WorkspaceMode,
} from '@/config/workspace-modes';

const DEFAULT_PROJECT_NAME = 'Untitled project';

const trimProjectName = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_PROJECT_NAME;
};

export const createProject = async ({
  name,
  initialSnapshot,
  workspaceMode = defaultWorkspaceMode,
}: {
  name?: string | null;
  initialSnapshot?: ProjectSnapshotDocument;
  workspaceMode?: WorkspaceMode;
}) => {
  const db = await getDb();
  const id = randomUUID();
  const now = new Date();
  const document = initialSnapshot ?? createEmptyProjectSnapshot();

  await db.insert(project).values({
    id,
    name: trimProjectName(name),
    coverAssetId: null,
    coverMode: 'auto',
    status: 'active',
    currentStateVersion: 1,
    lastWorkspaceMode: resolveWorkspaceMode(workspaceMode),
    lastOpenedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(projectCanvasState).values({
    projectId: id,
    documentJson: document,
    version: 1,
    updatedAt: now,
  });

  return {
    id,
    name: trimProjectName(name),
    snapshot: document,
  };
};

export const loadProjects = async ({ limit = 24 }: { limit?: number }) => {
  const db = await getDb();
  const projects = await db
    .select()
    .from(project)
    .where(eq(project.status, 'active'))
    .orderBy(
      desc(project.lastOpenedAt),
      desc(project.updatedAt),
      desc(project.createdAt)
    )
    .limit(limit);

  return Promise.all(
    projects.map(async (entry: any) => ({
      ...entry,
      coverImageUrl: (await resolveProjectCover(db, entry))?.publicUrl ?? null,
    }))
  );
};

export const getProject = async ({ projectId }: { projectId: string }) => {
  const db = await getDb();
  const rows = await db
    .select()
    .from(project)
    .where(eq(project.id, projectId))
    .limit(1);

  return rows[0] ?? null;
};

export const getActiveProject = async ({
  projectId,
}: {
  projectId: string;
}) => {
  const currentProject = await getProject({ projectId });
  return currentProject?.status === 'active' ? currentProject : null;
};

export const renameProject = async ({
  projectId,
  name,
}: {
  projectId: string;
  name: string;
}) => {
  const nextName = trimProjectName(name);
  const db = await getDb();
  await db
    .update(project)
    .set({
      name: nextName,
      updatedAt: new Date(),
    })
    .where(eq(project.id, projectId));

  return nextName;
};

export const markProjectOpened = async ({
  projectId,
  workspaceMode,
}: {
  projectId: string;
  workspaceMode?: WorkspaceMode;
}) => {
  const db = await getDb();
  const now = new Date();
  await db
    .update(project)
    .set({
      lastOpenedAt: now,
      ...(workspaceMode
        ? { lastWorkspaceMode: resolveWorkspaceMode(workspaceMode) }
        : {}),
    })
    .where(eq(project.id, projectId));
};

export const loadProjectWithLatestSnapshot = async ({
  projectId,
  canvasId,
  allowArchivedCanvas = false,
}: {
  projectId: string;
  canvasId?: string | null;
  allowArchivedCanvas?: boolean;
}) => {
  const db = await getDb();
  const currentProject = await getActiveProject({ projectId });
  if (!currentProject) {
    return null;
  }

  const resolvedCanvasId = scopedCanvasId(projectId, canvasId);
  const entry = await getCanvasEntry(projectId, resolvedCanvasId, allowArchivedCanvas);
  if (entry.storageKind === 'document') return {
    project: currentProject,
    snapshotVersion: entry.version ?? 1,
    snapshot: normalizeProjectSnapshotDocument(entry.documentJson),
  };

  const snapshotRows = await db
    .select()
    .from(projectCanvasState)
    .where(eq(projectCanvasState.projectId, projectId))
    .limit(1);

  return {
    project: currentProject,
    snapshotVersion: snapshotRows[0]?.version ?? 1,
    snapshot: normalizeProjectSnapshotDocument(
      snapshotRows[0]?.documentJson ?? createEmptyProjectSnapshot()
    ),
  };
};

const deleteProjectsInsideTransaction = async ({
  projectIds,
}: {
  projectIds: string[];
}) => {
  if (projectIds.length === 0) return;

  const db = await getDb();
  const now = new Date();

  for (const projectId of projectIds) {
    const { assertProjectMayBeRemoved } = await import('@/core/series/deletion-guards');
    await assertProjectMayBeRemoved(projectId);
    await db
      .update(project)
      .set({
        status: 'deleted',
        deletedAt: now,
        updatedAt: now,
      })
      .where(eq(project.id, projectId));
  }
};

export const deleteProjects = (input: Parameters<typeof deleteProjectsInsideTransaction>[0]) => withDatabaseTransaction(() => deleteProjectsInsideTransaction(input));

const saveProjectSnapshotInsideTransaction = async ({
  projectId,
  canvasId,
  document,
  baseVersion,
  allowEmpty = false,
  allowArchivedCanvas = false,
  allowRestoreDeleted = false,
}: {
  projectId: string;
  canvasId?: string | null;
  document: ProjectSnapshotDocument;
  baseVersion?: number | null;
  allowEmpty?: boolean;
  allowArchivedCanvas?: boolean;
  allowRestoreDeleted?: boolean;
}) => {
  const db = await getDb();
  const currentProject = await getActiveProject({ projectId });
  if (!currentProject) {
    throw new Error('Project not found');
  }

  const resolvedCanvasId = scopedCanvasId(projectId, canvasId);
  if (resolvedCanvasId !== defaultCanvasId(projectId)) return saveSceneCanvasSnapshot({
    projectId, canvasId: resolvedCanvasId, document, baseVersion, allowEmpty, allowArchivedCanvas, allowRestoreDeleted,
  });
  await getCanvasEntry(projectId, resolvedCanvasId);

  const normalizedDocument = normalizeProjectSnapshotDocument(document);
  const stateRows = await db
    .select()
    .from(projectCanvasState)
    .where(eq(projectCanvasState.projectId, projectId))
    .limit(1);

  const currentState = stateRows[0] ?? null;
  if ((currentState?.documentJson as ProjectSnapshotDocument)?.version === 5 && document.version !== 5)
    throw new (await import('@/core/series/contracts')).ScopeError('CAPABILITY_REQUIRED', 'This Canvas requires the current v5 client. Reload before saving.');
  if (
    document.version !== 4 && document.version !== 5 &&
    (currentState?.documentJson as ProjectSnapshotDocument)?.organization
  )
    throw new Error(
      'This Canvas uses organization metadata. Reload with the current client before saving.'
    );
  const { validateOrganizationBindings } =
    await import('@/core/organization/service');
  await validateOrganizationBindings(projectId, normalizedDocument);
  const previousDocument = currentState
    ? normalizeProjectSnapshotDocument(currentState.documentJson)
    : null;
  if (
    previousDocument &&
    isDestructiveEmptyProjectSnapshot({
      previous: previousDocument,
      next: normalizedDocument,
    }) &&
    !allowEmpty
  ) {
    const error = new Error(
      'Refusing to replace a non-empty project snapshot with an unconfirmed empty snapshot'
    );
    error.name = 'ProjectSnapshotDestructiveEmptyRejected';
    throw error;
  }
  const nextSerialized = JSON.stringify(normalizedDocument);
  const previousSerialized = previousDocument
    ? JSON.stringify(previousDocument)
    : null;

  const throwVersionConflict = (currentVersion: number) => {
    const error = new Error('Project snapshot version conflict') as Error & {
      currentVersion?: number;
    };
    error.name = 'ProjectSnapshotVersionConflict';
    error.currentVersion = currentVersion;
    throw error;
  };

  if (
    currentState &&
    hasProjectSnapshotVersionConflict({
      currentVersion: currentState.version,
      baseVersion,
      documentChanged: previousSerialized !== nextSerialized,
    })
  ) {
    throwVersionConflict(currentState.version);
  }
  const nextVersion = (currentState?.version ?? 0) + 1;
  const now = new Date();

  if (previousSerialized !== nextSerialized) {
    await updateCanvasLocators(projectId, resolvedCanvasId, normalizedDocument, allowRestoreDeleted);
    if (currentState) {
      const updated = await db
        .update(projectCanvasState)
        .set({
          documentJson: normalizedDocument,
          version: nextVersion,
          updatedAt: now,
        })
        .where(
          and(
            eq(projectCanvasState.projectId, projectId),
            eq(projectCanvasState.version, baseVersion as number)
          )
        )
        .returning({ version: projectCanvasState.version });
      if (updated.length === 0) {
        const latest = await db
          .select({ version: projectCanvasState.version })
          .from(projectCanvasState)
          .where(eq(projectCanvasState.projectId, projectId))
          .limit(1);
        throwVersionConflict(latest[0]?.version ?? currentState.version);
      }
    } else {
      const inserted = await db
        .insert(projectCanvasState)
        .values({
          projectId,
          documentJson: normalizedDocument,
          version: nextVersion,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning({ version: projectCanvasState.version });
      if (inserted.length === 0) {
        const latest = await db
          .select({ version: projectCanvasState.version })
          .from(projectCanvasState)
          .where(eq(projectCanvasState.projectId, projectId))
          .limit(1);
        throwVersionConflict(latest[0]?.version ?? 1);
      }
    }

    await db
      .update(project)
      .set({
        currentStateVersion: nextVersion,
        updatedAt: now,
        lastOpenedAt: now,
      })
      .where(eq(project.id, projectId));
  } else {
    await db
      .update(project)
      .set({
        lastOpenedAt: now,
      })
      .where(eq(project.id, projectId));
  }

  return {
    version:
      previousSerialized === nextSerialized
        ? (currentState?.version ?? 1)
        : nextVersion,
  };
};

export const saveProjectSnapshot = (
  input: Parameters<typeof saveProjectSnapshotInsideTransaction>[0]
) => withDatabaseTransaction(async () => {
  const result = await saveProjectSnapshotInsideTransaction(input);
  const { syncSeriesConsumers } = await import('@/core/series/shared-assets');
  await syncSeriesConsumers(input.projectId, scopedCanvasId(input.projectId, input.canvasId), input.document);
  return result;
});
