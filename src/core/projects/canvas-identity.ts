export const defaultCanvasId = (projectId: string) => `default:${projectId}`;
export const resolveCanvasId = (projectId: string, canvasId?: string | null) =>
  canvasId ?? defaultCanvasId(projectId);
