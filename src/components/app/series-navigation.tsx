import { useState, type ComponentProps } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ListTree,
  Plus,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  LayoutDashboard,
  Search,
  Archive,
  PanelsTopLeft,
} from 'lucide-react';
import { WorkspacePopover, workspaceRow } from './workspace-popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
function InlineNavigation({
  children,
}: ComponentProps<typeof WorkspacePopover>) {
  return (
    <section className="mx-auto w-full max-w-3xl space-y-1 p-6">
      {children}
    </section>
  );
}
export function SeriesNavigation({ embedded = false }: { embedded?: boolean }) {
  const scope = useWorkspaceScope();
  const navigate = useScopeNavigation();
  const t = useTranslations('Series');
  const productionT = useTranslations('Production');
  const NavigationSurface = embedded ? InlineNavigation : WorkspacePopover;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
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
    refetchInterval: open || embedded ? 3000 : false,
  });
  if (!scope || !query.data) return null;
  const state = query.data;
  const currentScene = state.scenes.find((s) => s.id === scope.sceneId);
  async function run(
    command: Parameters<typeof narrativeCommand>[2],
    expectedRevision = state.revision
  ) {
    setBusy(true);
    try {
      await narrativeCommand(scope!.projectId, expectedRevision, command);
      await query.refetch();
      setName('');
      setCreating(false);
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
      `/canvas/${encodeURIComponent(scope.projectId)}${scopeSearch({ canvasId, sceneId })}`
    );
  };
  const defaultId = defaultCanvasId(scope.projectId);
  const matches = (value: string) =>
    value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  const edit = (action: () => void) => {
    setOpen(false);
    action();
  };
  const row = (canvas: (typeof state.canvases)[number]) => (
    <div
      key={canvas.id}
      className="flex min-w-0 items-center"
      data-canvas-entry={canvas.id}
    >
      <button
        className={`${workspaceRow} min-w-0 flex-1 ${(scope.canvasId ?? defaultId) === canvas.id ? 'bg-white/8' : ''}`}
        title={canvas.name}
        aria-current={
          (scope.canvasId ?? defaultId) === canvas.id ? 'page' : undefined
        }
        disabled={Boolean(canvas.archivedAt)}
        onClick={() => go(canvas.id, canvas.sceneId ?? undefined)}
      >
        <PanelsTopLeft size={14} className="shrink-0 opacity-60" />
        <span className="truncate">
          {canvas.id === defaultId ? t('projectCanvas') : canvas.name}
        </span>
      </button>
      {embedded && (
        <WorkspacePopover
          label={t('canvasActions', { name: canvas.name })}
          trigger={<MoreHorizontal size={16} />}
          align="end"
        >
          <button
            className={workspaceRow}
            disabled={busy}
            onClick={() =>
              edit(() =>
                setEditCanvas({
                  id: canvas.id,
                  name: canvas.name,
                  sceneId: canvas.sceneId,
                })
              )
            }
          >
            {t('rename')} / {t('sceneMembership')}
          </button>
          {canvas.id !== defaultId && (
            <button
              className={workspaceRow}
              disabled={busy}
              onClick={() =>
                canvas.archivedAt
                  ? void run({
                      type: 'update_canvas',
                      canvasId: canvas.id,
                      archived: false,
                    })
                  : edit(() =>
                      setArchive({
                        type: 'canvas',
                        id: canvas.id,
                        revision: state.revision,
                        count: 1,
                      })
                    )
              }
            >
              {t(canvas.archivedAt ? 'restore' : 'archive')}
            </button>
          )}
        </WorkspacePopover>
      )}
    </div>
  );
  const scenes = state.scenes.filter(
    (scene) =>
      (showArchived || !scene.archivedAt) &&
      (matches(scene.name) ||
        state.canvases.some((c) => c.sceneId === scene.id && matches(c.name)))
  );
  return (
    <>
      <NavigationSurface
        open={open}
        onOpenChange={setOpen}
        label={t('navigation')}
        className="max-w-64 border border-white/10"
        trigger={
          <>
            <ListTree size={16} />
            <span className="max-w-48 truncate">
              {currentScene?.name || t('projectCanvas')}
            </span>
            <ChevronDown size={14} />
          </>
        }
      >
        {embedded && (
          <h1 className="mb-5 text-xl font-semibold">
            {productionT('sceneCanvases')}
          </h1>
        )}
        {state.episode && (
          <div className="px-2 pb-2 pt-1 text-xs text-[var(--beat-text-3)]">
            {state.episode.label || state.episode.name}
          </div>
        )}
        {state.episode && (
          <button
            className={workspaceRow}
            onClick={() => {
              setOpen(false);
              void navigate(`/series/${state.episode!.seriesId}`);
            }}
          >
            <LayoutDashboard size={15} />
            {t('overview')}
          </button>
        )}
        {state.canvases.filter((c) => c.id === defaultId).map(row)}
        <label className="my-2 flex items-center gap-2 rounded-lg border border-white/10 px-2.5">
          <Search size={14} className="opacity-50" />
          <input
            className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none"
            aria-label={t('searchScenes')}
            placeholder={t('searchScenes')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="space-y-0.5" aria-label={t('navigation')}>
          {scenes.map((scene) => {
            const canvases = state.canvases.filter(
              (c) => c.sceneId === scene.id && (showArchived || !c.archivedAt)
            );
            const isExpanded =
              expanded.includes(scene.id) || Boolean(search.trim());
            return (
              <div key={scene.id} data-scene-entry={scene.id}>
                <div className="flex items-center rounded-md">
                  <button
                    className={`flex size-8 shrink-0 items-center justify-center rounded hover:bg-white/7 ${canvases.length === 1 && !embedded ? 'invisible' : ''}`}
                    aria-label={t('expandScene', { name: scene.name })}
                    aria-expanded={isExpanded}
                    onClick={() =>
                      setExpanded((v) =>
                        v.includes(scene.id)
                          ? v.filter((id) => id !== scene.id)
                          : [...v, scene.id]
                      )
                    }
                  >
                    {isExpanded ? (
                      <ChevronDown size={14} />
                    ) : (
                      <ChevronRight size={14} />
                    )}
                  </button>
                  <button
                    className={`${workspaceRow} min-w-0 flex-1 ${scene.id === scope.sceneId ? 'bg-white/8' : ''}`}
                    disabled={Boolean(scene.archivedAt)}
                    title={scene.summary || scene.name}
                    aria-current={
                      scene.id === scope.sceneId ? 'page' : undefined
                    }
                    onClick={() =>
                      canvases.filter((c) => !c.archivedAt).length === 1
                        ? go(canvases.find((c) => !c.archivedAt)!.id, scene.id)
                        : setExpanded((v) =>
                            v.includes(scene.id) ? v : [...v, scene.id]
                          )
                    }
                  >
                    <span className="truncate">{scene.name}</span>
                    <span className="ml-auto text-xs opacity-40">
                      {canvases.length}
                    </span>
                  </button>
                  {embedded && (
                    <WorkspacePopover
                      label={t('sceneActions', { name: scene.name })}
                      trigger={<MoreHorizontal size={16} />}
                      align="end"
                    >
                      <button
                        className={workspaceRow}
                        disabled={busy || Boolean(scene.archivedAt)}
                        onClick={() =>
                          edit(() =>
                            setEditScene({
                              id: scene.id,
                              name: scene.name,
                              summary: scene.summary,
                            })
                          )
                        }
                      >
                        {t('rename')}
                      </button>
                      <button
                        className={workspaceRow}
                        disabled={busy || Boolean(scene.archivedAt)}
                        onClick={() =>
                          void run({
                            type: 'create_canvas',
                            canvasId: crypto.randomUUID(),
                            sceneId: scene.id,
                            name: canvases.length
                              ? `${t('canvas')} ${canvases.length + 1}`
                              : t('mainCanvas'),
                          })
                        }
                      >
                        {t('newCanvas')}
                      </button>
                      <button
                        className={workspaceRow}
                        disabled={busy || state.scenes[0]?.id === scene.id}
                        onClick={() => {
                          const ids = state.scenes.map((s) => s.id);
                          const i = ids.indexOf(scene.id);
                          [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
                          void run({ type: 'set_scene_order', sceneIds: ids });
                        }}
                      >
                        {t('moveUp')}
                      </button>
                      <button
                        className={workspaceRow}
                        disabled={busy}
                        onClick={() =>
                          scene.archivedAt
                            ? void run({
                                type: 'set_scene_archived',
                                sceneId: scene.id,
                                archived: false,
                              })
                            : edit(() =>
                                setArchive({
                                  type: 'scene',
                                  id: scene.id,
                                  revision: state.revision,
                                  count: canvases.length,
                                })
                              )
                        }
                      >
                        {t(scene.archivedAt ? 'restore' : 'archive')}
                      </button>
                    </WorkspacePopover>
                  )}
                </div>
                {isExpanded && (
                  <div className="ml-4 border-l border-white/10 pl-2">
                    {canvases
                      .filter((c) => matches(scene.name) || matches(c.name))
                      .map(row)}
                    {!canvases.length && !scene.archivedAt && (
                      <button
                        className={workspaceRow}
                        disabled={busy}
                        onClick={() =>
                          void run({
                            type: 'create_canvas',
                            canvasId: crypto.randomUUID(),
                            sceneId: scene.id,
                            name: t('mainCanvas'),
                          })
                        }
                      >
                        <Plus size={14} />
                        {t('newCanvas')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {search && !scenes.length && (
            <p className="px-3 py-4 text-sm text-[var(--beat-text-3)]">
              {t('noMatchingScenes')}
            </p>
          )}
          {state.canvases.some(
            (c) =>
              !c.sceneId &&
              c.id !== defaultId &&
              (showArchived || !c.archivedAt)
          ) && (
            <details className="pt-2" open={search ? true : undefined}>
              <summary
                className={`${workspaceRow} cursor-pointer text-[var(--beat-text-3)]`}
              >
                {t('unassigned')}
              </summary>
              <div className="ml-3 border-l border-white/10 pl-2">
                {state.canvases
                  .filter(
                    (c) =>
                      !c.sceneId &&
                      c.id !== defaultId &&
                      (showArchived || !c.archivedAt) &&
                      matches(c.name)
                  )
                  .map(row)}
              </div>
            </details>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2">
          <button
            className={workspaceRow}
            onClick={() => edit(() => setCreating(true))}
          >
            <Plus size={15} />
            {t('newScene')}
          </button>
          {embedded && (
            <button
              className="shrink-0 rounded-md p-2 hover:bg-white/7"
              aria-label={t('showArchived')}
              aria-pressed={showArchived}
              title={t('showArchived')}
              onClick={() => setShowArchived((v) => !v)}
            >
              <Archive size={16} />
            </button>
          )}
        </div>
        {!embedded && (
          <button
            className={`${workspaceRow} mt-2 border-t border-white/10`}
            onClick={() => {
              setOpen(false);
              void navigate(`/studio/${scope.projectId}?panel=scenes`);
            }}
          >
            <LayoutDashboard size={15} />
            {productionT('projectOverview')}
          </button>
        )}
      </NavigationSurface>
      <Dialog
        open={Boolean(editScene || editCanvas || archive || creating)}
        onOpenChange={(value) => {
          if (!value && !busy) {
            setEditScene(null);
            setEditCanvas(null);
            setArchive(null);
            setCreating(false);
          }
        }}
      >
        <DialogContent className="max-h-[80vh] overflow-y-auto bg-[var(--beat-surface)] text-[var(--beat-text-1)]">
          <DialogHeader>
            <DialogTitle>
              {archive
                ? t('confirmArchive')
                : creating
                  ? t('newScene')
                  : editScene
                    ? t('sceneName')
                    : t('canvasName')}
            </DialogTitle>
          </DialogHeader>
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
                    archive.revision
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
          {creating && (
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
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
