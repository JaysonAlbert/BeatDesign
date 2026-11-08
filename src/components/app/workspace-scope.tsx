import { createContext, useContext, useState, useMemo, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import type { CanvasShotOutlineEntry } from '@/core/beatcanvas/draft-shape';
import type { getNarrative } from '@/core/series/narrative';
import { useRouter } from '@/core/i18n/navigation';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { fetchNarrative } from '@/core/series/client';
import { useBlocker } from '@tanstack/react-router';

export type WorkspaceScope = {
  projectId: string;
  canvasId: string | null;
  sceneId: string | null;
  narrative: Awaited<ReturnType<typeof getNarrative>>;
};
const ScopeContext = createContext<WorkspaceScope | null>(null);
type CanvasOutline = { canvasId: string; entries: CanvasShotOutlineEntry[]; selectedId?: string };
const OutlineContext = createContext<{
  outline: CanvasOutline | null;
  setOutline: Dispatch<SetStateAction<CanvasOutline | null>>;
} | null>(null);
export const useCanvasOutline = () => useContext(OutlineContext);
export const useWorkspaceScope = () => useContext(ScopeContext);
export function WorkspaceScopeProvider({
  value,
  children,
}: {
  value: WorkspaceScope;
  children: ReactNode;
}) {
  const [outline, setOutline] = useState<CanvasOutline | null>(null);
  const outlineValue = useMemo(() => ({ outline, setOutline }), [outline]);
  const narrative = useQuery({
    queryKey: ['narrative', value.projectId],
    queryFn: () => fetchNarrative(value.projectId),
    initialData: value.narrative,
  });
  useBlocker({
    enableBeforeUnload: false,
    shouldBlockFn: async () => {
      const pending: Promise<void>[] = [];
      window.dispatchEvent(
        new CustomEvent('beatdesign:before-scope-change', {
          detail: { waitUntil: (save: Promise<void>) => pending.push(save) },
        }),
      );
      try {
        await Promise.all(pending);
        return false;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Save failed');
        return true;
      }
    },
  });
  return (
    <ScopeContext.Provider value={{ ...value, narrative: narrative.data }}>
      <OutlineContext.Provider value={outlineValue}>{children}</OutlineContext.Provider>
    </ScopeContext.Provider>
  );
}
export function useScopeNavigation() {
  const router = useRouter();
  return async (href: string) => {
    const saves: Promise<void>[] = [];
    window.dispatchEvent(
      new CustomEvent('beatdesign:before-scope-change', {
        detail: { waitUntil: (save: Promise<void>) => saves.push(save) },
      }),
    );
    try {
      await Promise.all(saves);
      router.push(href);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Save failed');
    }
  };
}
export function scopeSearch(scope: {
  sceneId?: string | null;
  canvasId?: string | null;
}) {
  const params = new URLSearchParams();
  if (scope.sceneId) params.set('sceneId', scope.sceneId);
  if (scope.canvasId) params.set('canvasId', scope.canvasId);
  return params.size ? `?${params}` : '';
}
