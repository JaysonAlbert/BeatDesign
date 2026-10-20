import { defaultCanvasId } from '@/core/projects/canvas-identity';
export type NarrativeDirectory = {
  projectId: string;
  scenes: { id: string; archivedAt: number | null }[];
  canvases: { id: string; sceneId: string | null; archivedAt: number | null }[];
};
export function resolveNarrativeScope(
  directory: NarrativeDirectory,
  requested: { sceneId?: string; canvasId?: string },
) {
  const canvasId =
    requested.canvasId ??
    (requested.sceneId
      ? directory.canvases.find(
          (c) => c.sceneId === requested.sceneId && !c.archivedAt,
        )?.id
      : defaultCanvasId(directory.projectId));
  const scene = requested.sceneId
    ? directory.scenes.find((s) => s.id === requested.sceneId && !s.archivedAt)
    : undefined;
  if (requested.sceneId && !scene)
    return {
      canvasId: null,
      sceneId: requested.sceneId,
      error: 'scene_unavailable' as const,
    };
  if (!canvasId && scene)
    return { canvasId: null, sceneId: scene.id, error: null };
  const canvas = directory.canvases.find(
    (c) => c.id === canvasId && !c.archivedAt,
  );
  if (
    !requested.sceneId &&
    canvas?.id === defaultCanvasId(directory.projectId) &&
    canvas.sceneId &&
    !directory.scenes.some((s) => s.id === canvas.sceneId && !s.archivedAt)
  )
    return { canvasId: canvas.id, sceneId: null, error: null };
  if (
    !canvas ||
    (requested.sceneId && canvas.sceneId !== requested.sceneId) ||
    (canvas.sceneId &&
      !directory.scenes.some((s) => s.id === canvas.sceneId && !s.archivedAt))
  )
    return {
      canvasId: null,
      sceneId: requested.sceneId ?? null,
      error: 'canvas_unavailable' as const,
    };
  return { canvasId: canvas.id, sceneId: canvas.sceneId, error: null };
}
