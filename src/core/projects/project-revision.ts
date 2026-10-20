import { eq } from 'drizzle-orm';
import {
  project,
  projectCanvasState,
  projectTimelineState,
  projectOrganizationState,
} from '@/config/db/schema';
import { getDb } from '@/core/workspace-lib/db-adapter';
import { scopedCanvasId } from './canvas-scope';
import { getCanvasEntry } from '@/core/series/narrative';

export async function loadProjectRevision(projectId: string, canvasId?: string | null) {
  const db = await getDb();
  const [row] = await db
    .select({
      status: project.status,
      canvas: projectCanvasState.version,
      timeline: projectTimelineState.version,
      organization: projectOrganizationState.version,
    })
    .from(project)
    .leftJoin(projectCanvasState, eq(projectCanvasState.projectId, project.id))
    .leftJoin(
      projectTimelineState,
      eq(projectTimelineState.projectId, project.id)
    )
    .leftJoin(
      projectOrganizationState,
      eq(projectOrganizationState.projectId, project.id)
    )
    .where(eq(project.id, projectId))
    .limit(1);
  const entry = row?.status === 'active' ? await getCanvasEntry(projectId, scopedCanvasId(projectId, canvasId)) : null;
  return row?.status === 'active'
    ? {
        canvas: entry?.storageKind === 'document' ? entry.version ?? 1 : row.canvas ?? 1,
        timeline: row.timeline,
        organization: row.organization ?? 0,
      }
    : null;
}
