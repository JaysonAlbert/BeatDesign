import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ListTree, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useTranslations } from '@/core/workspace-lib/shims/next-intl';
import { fetchNarrative, narrativeCommand } from '@/core/series/client';
import {
  useScopeNavigation,
  useWorkspaceScope,
  scopeSearch,
} from './workspace-scope';
import { defaultCanvasId } from '@/core/projects/canvas-identity';
import { toast } from 'sonner';

const control =
  'min-h-11 rounded-lg border border-white/15 bg-white/5 px-3 text-sm focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-40';
export function SeriesNavigation() {
  const scope = useWorkspaceScope();
  const navigate = useScopeNavigation();
  const t = useTranslations('Series');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [editScene, setEditScene] = useState<{
    id: string;
    name: string;
    summary: string;
  } | null>(null);
  const [editCanvas, setEditCanvas] = useState<{
    id: string;
    name: string;
    sceneId: string | null;
  } | null>(null);
  const [archive, setArchive] = useState<{
    type: 'scene' | 'canvas';
    id: string;
    revision: number;
    count: number;
  } | null>(null);
  const query = useQuery({
    queryKey: ['narrative', scope?.projectId],
    queryFn: () => fetchNarrative(scope!.projectId),
    enabled: Boolean(scope),
    initialData: scope?.narrative,
    refetchInterval: open ? 3000 : false,
  });
  if (!scope || !query.data) return null;
  const state = query.data;
  const currentScene = state.scenes.find((s) => s.id === scope.sceneId);
  async function run(
    command: Parameters<typeof narrativeCommand>[2],
    expectedRevision = state.revision,
  ) {
    setBusy(true);
    try {
      await narrativeCommand(scope!.projectId, expectedRevision, command);
      await query.refetch();
      setName('');
      setEditScene(null);
      setEditCanvas(null);
      setArchive(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }
  const go = (canvasId?: string, sceneId?: string) => {
    setOpen(false);
    void navigate(
      `/canvas/${encodeURIComponent(scope.projectId)}${scopeSearch({ canvasId, sceneId })}`,
    );
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={`${control} flex max-w-64 items-center gap-2`}
        aria-label={t('navigation')}
      >
        <ListTree size={16} />
        <span className="hidden truncate md:inline">
          {state.episode?.label || state.episode?.name || t('standalone')} /{' '}
          {currentScene?.name || t('projectCanvas')}
        </span>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto bg-[#131416] text-white">
        <DialogHeader>
          <DialogTitle>{t('navigation')}</DialogTitle>
        </DialogHeader>
        {state.episode && (
          <button
            className={control}
            onClick={() => {
              setOpen(false);
              void navigate(`/series/${state.episode!.seriesId}`);
            }}
          >
            {state.episode.name} · {t('overview')}
          </button>
        )}
        <button
          className={control}
          onClick={() => go(defaultCanvasId(scope.projectId))}
        >
          {t('projectCanvas')}
        </button>
        <button
          className={control}
          onClick={() => {
            const entry = state.canvases.find(
              (c) => c.id === defaultCanvasId(scope.projectId),
            )!;
            setEditCanvas({
              id: entry.id,
              name: entry.name,
              sceneId: entry.sceneId,
            });
          }}
        >
          {t('sceneMembership')} · {t('projectCanvas')}
        </button>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          {t('showArchived')}
        </label>
        <div className="space-y-3">
          {state.scenes
            .filter((s) => showArchived || !s.archivedAt)
            .map((scene) => (
              <section
                key={scene.id}
                className="rounded-xl border border-white/10 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className={`${control} flex-1 text-left`}
                    onClick={() => go(undefined, scene.id)}
                    disabled={Boolean(scene.archivedAt)}
                  >
                    {scene.name}
                  </button>
                  <button
                    className={control}
                    disabled={busy}
                    onClick={() =>
                      scene.archivedAt
                        ? void run({
                            type: 'set_scene_archived',
                            sceneId: scene.id,
                            archived: false,
                          })
                        : setArchive({
                            type: 'scene',
                            id: scene.id,
                            revision: state.revision,
                            count: state.canvases.filter(
                              (c) => c.sceneId === scene.id,
                            ).length,
                          })
                    }
                  >
                    {scene.archivedAt ? t('restore') : t('archive')}
                  </button>
                  <button
                    className={control}
                    disabled={busy || Boolean(scene.archivedAt)}
                    onClick={() =>
                      setEditScene({
                        id: scene.id,
                        name: scene.name,
                        summary: scene.summary,
                      })
                    }
                  >
                    {t('rename')}
                  </button>
                  <button
                    className={control}
                    disabled={busy || state.scenes[0].id === scene.id}
                    onClick={() => {
                      const ids = state.scenes.map((s) => s.id);
                      const index = ids.indexOf(scene.id);
                      [ids[index - 1], ids[index]] = [
                        ids[index],
                        ids[index - 1],
                      ];
                      void run({ type: 'set_scene_order', sceneIds: ids });
                    }}
                  >
                    {t('moveUp')}
                  </button>
                </div>
                {scene.summary && (
                  <p className="my-2 text-sm text-white/60">{scene.summary}</p>
                )}
                <div className="mt-2 space-y-1">
                  {state.canvases
                    .filter(
                      (c) =>
                        c.sceneId === scene.id &&
                        (showArchived || !c.archivedAt),
                    )
                    .map((canvas) => (
                      <div key={canvas.id} className="flex gap-1">
                        <button
                          className={`${control} flex-1 text-left`}
                          disabled={Boolean(
                            canvas.archivedAt || scene.archivedAt,
                          )}
                          onClick={() => go(canvas.id, scene.id)}
                        >
                          {canvas.name}
                        </button>
                        <button
                          className={control}
                          disabled={busy}
                          onClick={() =>
                            setEditCanvas({
                              id: canvas.id,
                              name: canvas.name,
                              sceneId: canvas.sceneId,
                            })
                          }
                        >
                          {t('rename')}
                        </button>
                        {canvas.id !== defaultCanvasId(scope.projectId) && (
                          <button
                            className={control}
                            disabled={busy}
                            onClick={() =>
                              canvas.archivedAt
                                ? void run({
                                    type: 'update_canvas',
                                    canvasId: canvas.id,
                                    archived: false,
                                  })
                                : setArchive({
                                    type: 'canvas',
                                    id: canvas.id,
                                    revision: state.revision,
                                    count: 1,
                                  })
                            }
                          >
                            {canvas.archivedAt ? t('restore') : t('archive')}
                          </button>
                        )}
                      </div>
                    ))}
                </div>
                {!scene.archivedAt && (
                  <button
                    className={`${control} mt-2`}
                    disabled={busy}
                    onClick={() =>
                      void run({
                        type: 'create_canvas',
                        canvasId: crypto.randomUUID(),
                        sceneId: scene.id,
                        name: `${t('canvas')} ${state.canvases.filter((c) => c.sceneId === scene.id).length + 1}`,
                      })
                    }
                  >
                    <Plus className="mr-1 inline size-4" />
                    {t('newCanvas')}
                  </button>
                )}
              </section>
            ))}
        </div>
        {state.canvases
          .filter(
            (c) =>
              !c.sceneId &&
              c.id !== defaultCanvasId(scope.projectId) &&
              (showArchived || !c.archivedAt),
          )
          .map((c) => (
            <div className="flex gap-2" key={c.id}>
              <button
                className={`${control} flex-1`}
                disabled={Boolean(c.archivedAt)}
                onClick={() => go(c.id)}
              >
                {t('unassigned')} · {c.name}
              </button>
              <button
                className={control}
                disabled={busy}
                onClick={() =>
                  setEditCanvas({ id: c.id, name: c.name, sceneId: null })
                }
              >
                {t('sceneMembership')}
              </button>
              {c.archivedAt && (
                <button
                  className={control}
                  disabled={busy}
                  onClick={() =>
                    void run({
                      type: 'update_canvas',
                      canvasId: c.id,
                      archived: false,
                    })
                  }
                >
                  {t('restore')}
                </button>
              )}
            </div>
          ))}
        {editScene && (
          <form
            className="space-y-2 rounded-xl border border-orange-500/40 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run({
                type: 'update_scene',
                sceneId: editScene.id,
                name: editScene.name,
                summary: editScene.summary,
              });
            }}
          >
            <input
              className={`${control} w-full`}
              aria-label={t('sceneName')}
              value={editScene.name}
              maxLength={120}
              onChange={(e) =>
                setEditScene({ ...editScene, name: e.target.value })
              }
            />
            <textarea
              className={`${control} w-full py-2`}
              aria-label={t('sceneSummary')}
              value={editScene.summary}
              maxLength={2000}
              onChange={(e) =>
                setEditScene({ ...editScene, summary: e.target.value })
              }
            />
            <button
              className={control}
              disabled={busy || !editScene.name.trim()}
            >
              {t('save')}
            </button>
            <button
              type="button"
              className={control}
              onClick={() => setEditScene(null)}
            >
              {t('cancel')}
            </button>
          </form>
        )}
        {editCanvas && (
          <form
            className="space-y-2 rounded-xl border border-orange-500/40 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run({
                type: 'update_canvas',
                canvasId: editCanvas.id,
                name: editCanvas.name,
                sceneId: editCanvas.sceneId,
              });
            }}
          >
            <input
              className={`${control} w-full`}
              aria-label={t('canvasName')}
              value={editCanvas.name}
              maxLength={120}
              onChange={(e) =>
                setEditCanvas({ ...editCanvas, name: e.target.value })
              }
            />
            <select
              className={`${control} w-full`}
              aria-label={t('sceneMembership')}
              value={editCanvas.sceneId ?? ''}
              onChange={(e) =>
                setEditCanvas({
                  ...editCanvas,
                  sceneId: e.target.value || null,
                })
              }
            >
              <option value="">{t('unassigned')}</option>
              {state.scenes
                .filter((s) => !s.archivedAt)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
            <button
              className={control}
              disabled={busy || !editCanvas.name.trim()}
            >
              {t('save')}
            </button>
            <button
              type="button"
              className={control}
              onClick={() => setEditCanvas(null)}
            >
              {t('cancel')}
            </button>
          </form>
        )}
        {archive && (
          <div className="space-y-3 rounded-lg border border-orange-500/40 p-3">
            <p>
              {archive.type === 'scene'
                ? t('archiveScenePreview', { count: archive.count })
                : t('archiveCanvasPreview')}
            </p>
            <button
              className={control}
              disabled={busy}
              onClick={() =>
                void run(
                  archive.type === 'scene'
                    ? {
                        type: 'set_scene_archived',
                        sceneId: archive.id,
                        archived: true,
                      }
                    : {
                        type: 'update_canvas',
                        canvasId: archive.id,
                        archived: true,
                      },
                  archive.revision,
                )
              }
            >
              {t('confirmArchive')}
            </button>
            <button className={control} onClick={() => setArchive(null)}>
              {t('cancel')}
            </button>
          </div>
        )}
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void run({
              type: 'create_scene',
              sceneId: crypto.randomUUID(),
              name,
            });
          }}
        >
          <input
            className={`${control} min-w-0 flex-1`}
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('sceneName')}
            aria-label={t('sceneName')}
          />
          <button className={control} disabled={busy || !name.trim()}>
            {t('newScene')}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
