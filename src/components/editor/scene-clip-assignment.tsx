import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useWorkspaceScope } from '@/components/app/workspace-scope';
import { useTranslations } from '@/core/workspace-lib/shims/next-intl';
import { fetchNarrative, narrativeCommand } from '@/core/series/client';
import { apiJsonGet } from '@/lib/api-client';
import { toast } from 'sonner';
export function SceneClipAssignment({
  projectId,
  selectedClipId,
  clips,
  onLocate,
}: {
  projectId: string;
  selectedClipId: string | null;
  clips: { id: string; name: string }[];
  onLocate: (id: string) => void;
}) {
  const context = useWorkspaceScope();
  const t = useTranslations('Series');
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ['narrative', projectId],
    queryFn: () => fetchNarrative(projectId),
    initialData: context?.narrative,
    refetchInterval: 3000,
  });
  if (!query.data?.scenes.length) return null;
  const state = query.data;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-white/10 px-4 py-2 text-sm">
      <label className="flex items-center gap-2">
        {t('clipScene')}
        <select
          className="min-h-11 max-w-60 rounded-lg border border-white/15 bg-white/5 px-3"
          aria-label={t('clipScene')}
          disabled={busy || !selectedClipId}
          value={
            state.clipScenes.find((tag: any) => tag.clipId === selectedClipId)
              ?.sceneId ?? ''
          }
          onChange={(event) => {
            const sceneId = event.target.value || null;
            setBusy(true);
            void (async () => {
              const saves: Promise<void>[] = [];
              window.dispatchEvent(
                new CustomEvent('beatdesign:before-scope-change', {
                  detail: {
                    waitUntil: (save: Promise<void>) => saves.push(save),
                  },
                }),
              );
              await Promise.all(saves);
              const [current, timeline] = await Promise.all([
                fetchNarrative(projectId),
                apiJsonGet<{ timeline: { version: number } | null }>(
                  `/api/app/projects/${projectId}/timeline`,
                ),
              ]);
              await narrativeCommand(projectId, current.revision, {
                type: 'set_clip_scene',
                sceneId,
                clipId: selectedClipId!,
                timelineRevision: timeline.timeline?.version ?? 0,
              });
              await query.refetch();
            })()
              .catch((error) =>
                toast.error(
                  error instanceof Error ? error.message : t('failed'),
                ),
              )
              .finally(() => setBusy(false));
          }}
        >
          <option value="">{t('unassigned')}</option>
          {state.scenes.map((scene) => (
            <option
              key={scene.id}
              value={scene.id}
              disabled={Boolean(scene.archivedAt)}
            >
              {scene.name}
              {scene.archivedAt ? ` · ${t('archived')}` : ''}
            </option>
          ))}
        </select>
      </label>
      {context?.sceneId && (
        <div className="flex max-w-full items-center gap-2 overflow-x-auto">
          <span className="shrink-0 text-xs text-white/50">
            {t('sceneClips')}
          </span>
          {state.clipScenes
            .filter((tag: any) => tag.sceneId === context.sceneId)
            .map((tag: any) => {
              const clip = clips.find((c) => c.id === tag.clipId);
              return clip ? (
                <button
                  key={clip.id}
                  className="min-h-11 shrink-0 rounded-md bg-white/5 px-3"
                  onClick={() => onLocate(clip.id)}
                >
                  {clip.name}
                </button>
              ) : null;
            })}
        </div>
      )}
    </div>
  );
}
