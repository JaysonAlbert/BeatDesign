import { AsyncLocalStorage } from 'node:async_hooks';
import { resolveCanvasId } from './canvas-identity';

const scope = new AsyncLocalStorage<{ projectId: string; canvasId: string }>();
export function scopedCanvasId(projectId: string, explicit?: string | null) {
  const current = scope.getStore();
  return resolveCanvasId(
    projectId,
    explicit ??
      (current?.projectId === projectId ? current.canvasId : undefined),
  );
}
export function withCanvasScope<T>(
  projectId: string,
  canvasId: string | null | undefined,
  run: () => T,
): T {
  return scope.run(
    { projectId, canvasId: scopedCanvasId(projectId, canvasId) },
    run,
  );
}
