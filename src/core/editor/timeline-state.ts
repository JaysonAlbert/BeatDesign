import { and, eq, notInArray, sql } from 'drizzle-orm';
import { withDatabaseTransaction } from '@/core/db/transaction-context';

import { projectTimelineState, projectSceneClip, projectNarrativeState } from '@/config/db/schema';
import {
  normalizeTimelineDocument,
  type TimelineDocument,
} from '@/core/editor/timeline-document';
import {
  getProject,
} from '@/core/projects/projects';
import { getDb } from '@/core/workspace-lib/db-adapter';

export const hasTimelineVersionConflict = ({
  currentVersion,
  baseVersion,
  documentChanged,
}: {
  currentVersion: number;
  baseVersion: number | null | undefined;
  documentChanged: boolean;
}) =>
  documentChanged &&
  (typeof baseVersion !== 'number' || baseVersion !== currentVersion);

export async function loadProjectTimeline(projectId: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(projectTimelineState)
    .where(eq(projectTimelineState.projectId, projectId))
    .limit(1);
  const state = rows[0];
  if (!state) return null;

  return {
    document: normalizeTimelineDocument(state.documentJson, projectId),
    version: state.version,
    updatedAt: state.updatedAt,
  };
}

async function saveProjectTimelineInsideTransaction({
  projectId,
  document,
  baseVersion,
}: {
  projectId: string;
  document: TimelineDocument;
  baseVersion?: number | null;
}) {
  const currentProject = await getProject({ projectId });
  if (!currentProject || currentProject.status !== 'active') {
    throw new Error('Project not found');
  }

  const normalized = normalizeTimelineDocument(document, projectId);
  const db = await getDb();
  const previous = await loadProjectTimeline(projectId);
  const previousSerialized = previous
    ? JSON.stringify(previous.document)
    : null;
  const nextSerialized = JSON.stringify(normalized);
  if (
    previous &&
    hasTimelineVersionConflict({
      currentVersion: previous.version,
      baseVersion,
      documentChanged: previousSerialized !== nextSerialized,
    })
  ) {
    const error = new Error('Timeline version conflict') as Error & {
      currentVersion?: number;
    };
    error.name = 'TimelineVersionConflict';
    error.currentVersion = previous.version;
    throw error;
  }
  if (previousSerialized === nextSerialized && previous) {
    return previous;
  }
  const nextVersion = (previous?.version ?? 0) + 1;
  const now = new Date();

  if (previous) {
    const updated = await db
      .update(projectTimelineState)
      .set({ documentJson: normalized, version: nextVersion, updatedAt: now })
      .where(
        and(
          eq(projectTimelineState.projectId, projectId),
          eq(projectTimelineState.version, baseVersion as number)
        )
      )
      .returning({ version: projectTimelineState.version });
    if (updated.length === 0) {
      const error = new Error('Timeline version conflict');
      error.name = 'TimelineVersionConflict';
      throw error;
    }
  } else {
    const inserted = await db
      .insert(projectTimelineState)
      .values({
        projectId,
        documentJson: normalized,
        version: nextVersion,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning({ version: projectTimelineState.version });
    if (inserted.length === 0) {
      const error = new Error('Timeline version conflict');
      error.name = 'TimelineVersionConflict';
      throw error;
    }
  }

  const clipIds = normalized.tracks.flatMap(track => track.clips.map(clip => clip.id));
  const removedTags = await db.delete(projectSceneClip).where(and(eq(projectSceneClip.projectId, projectId), clipIds.length ? notInArray(projectSceneClip.clipId, clipIds) : undefined)).returning({ id: projectSceneClip.id });
  if (removedTags.length) await db.update(projectNarrativeState).set({ revision: sql`${projectNarrativeState.revision} + 1` }).where(eq(projectNarrativeState.projectId, projectId));
  return { document: normalized, version: nextVersion, updatedAt: now };
}

export const saveProjectTimeline = (input: Parameters<typeof saveProjectTimelineInsideTransaction>[0]) => withDatabaseTransaction(() => saveProjectTimelineInsideTransaction(input));
