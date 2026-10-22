import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

const loadProjectsSchema = z.object({
  limit: z.number().int().positive().optional(),
});

const loadProjectWithLatestSnapshotSchema = z.object({
  projectId: z.string().min(1),
  canvasId: z.string().min(1).max(200).optional(),
  sceneId: z.string().min(1).max(200).optional(),
});

export const loadSerializedProjectsFn = createServerFn()
  .inputValidator(loadProjectsSchema)
  .handler(async ({ data }) => {
    const [{ loadProjects }, { serializeProjectCenterCard }] =
      await Promise.all([
        import('./projects'),
        import('./project-entry'),
      ]);
    const projects = await loadProjects({ limit: data.limit });
    return projects.map(serializeProjectCenterCard);
  });

export const loadProjectWithLatestSnapshotFn = createServerFn()
  .inputValidator(loadProjectWithLatestSnapshotSchema)
  .handler(async ({ data }) => {
    const { loadProjectWithLatestSnapshot, getActiveProject } = await import('./projects');
    const project = await getActiveProject({ projectId: data.projectId });
    if (!project) return null;
    const { getNarrative } = await import('@/core/series/narrative');
    const { resolveNarrativeScope } = await import('@/core/series/navigation');
    const narrative = await getNarrative(data.projectId);
    const scope = resolveNarrativeScope(narrative, data);
    if (!scope.canvasId) {
      const { createEmptyProjectSnapshot } = await import('./project-snapshot');
      return { project, snapshot: createEmptyProjectSnapshot(), snapshotVersion: 0, narrative, canvasId: null, sceneId: scope.sceneId, scopeError: scope.error };
    }
    const state = await loadProjectWithLatestSnapshot({ projectId: data.projectId, canvasId: scope.canvasId });
    return state ? { ...state, narrative, canvasId: scope.canvasId, sceneId: scope.sceneId, scopeError: scope.error } : null;
  });
