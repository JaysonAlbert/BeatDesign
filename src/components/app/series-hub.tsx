import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from '@/core/workspace-lib/shims/next-intl';
import { Link } from '@/core/i18n/navigation';
import {
  fetchSeries,
  fetchSeriesList,
  fetchNarrative,
  seriesCommand,
} from '@/core/series/client';
import { apiJsonGet, apiJsonPost } from '@/lib/api-client';
import { toast } from 'sonner';
const control =
  'min-h-11 rounded-lg border border-white/15 bg-white/5 px-3 text-sm focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-40';

export function SeriesHub({
  seriesId,
  embedded = false,
}: {
  seriesId?: string;
  embedded?: boolean;
}) {
  const t = useTranslations('Series');
  const [name, setName] = useState('');
  const [projectId, setProjectId] = useState('');
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const list = useQuery({
    queryKey: ['series-list', showArchived],
    queryFn: () => fetchSeriesList(showArchived),
  });
  const current = useQuery({
    queryKey: ['series', seriesId],
    queryFn: () => fetchSeries(seriesId!),
    enabled: Boolean(seriesId),
  });
  const [settings, setSettings] = useState({ name: '', description: '' });
  const [detach, setDetach] = useState<{
    previewToken: string;
    seriesRevision: number;
    changes: unknown[];
    blockers: string[];
  } | null>(null);
  useEffect(() => {
    if (current.data)
      setSettings({
        name: current.data.name,
        description: current.data.description,
      });
  }, [current.data?.revision]);
  const projects = useQuery({
    queryKey: ['series-attach-projects'],
    queryFn: () =>
      apiJsonGet<{ projects: { id: string; name: string }[] }>(
        '/api/app/projects?limit=500',
      ),
    enabled: Boolean(seriesId),
  });
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      setName('');
      await Promise.all([
        list.refetch(),
        seriesId ? current.refetch() : Promise.resolve(),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }
  const state = current.data;
  async function attach(id: string) {
    if (!state) return;
    const narrative = await fetchNarrative(id);
    await seriesCommand(state.id, state.revision, {
      type: 'attach_episode',
      episodeId: crypto.randomUUID(),
      projectId: id,
      narrativeRevision: narrative.revision,
    });
  }
  return (
    <section
      className={
        embedded
          ? 'mt-10 space-y-5 border-t border-white/10 pt-6'
          : 'mx-auto w-full max-w-6xl space-y-6 overflow-y-auto p-6'
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{state?.name ?? t('series')}</h2>
        {seriesId && (
          <Link className={control} href="/series">
            {t('allSeries')}
          </Link>
        )}
      </div>
      {(list.isError || current.isError) && <p role="alert">{t('failed')}</p>}
      {!seriesId ? (
        <>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() =>
                seriesCommand(crypto.randomUUID(), 0, { type: 'create', name }),
              );
            }}
          >
            <input
              className={control}
              aria-label={t('seriesName')}
              placeholder={t('seriesName')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
            />
            <button className={control} disabled={busy || !name.trim()}>
              {t('newSeries')}
            </button>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              {t('showArchived')}
            </label>
          </form>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.data?.map((item) => (
              <Link
                key={item.id}
                href={`/series/${item.id}`}
                className="rounded-xl border border-white/10 bg-white/[0.025] p-5 hover:border-orange-500/50"
              >
                <strong>{item.name}</strong>
                <p className="mt-2 line-clamp-2 text-sm text-white/50">
                  {item.description || t('seriesDescription')}
                </p>
                {item.archivedAt && <span>{t('archived')}</span>}
              </Link>
            ))}
          </div>
        </>
      ) : state ? (
        <>
          <p className="text-sm text-white/60">
            {state.description || t('seriesDescription')}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              className={control}
              disabled={busy}
              onClick={() =>
                void run(() =>
                  seriesCommand(state.id, state.revision, {
                    type: 'set_archived',
                    archived: !state.archivedAt,
                  }),
                )
              }
            >
              {state.archivedAt ? t('restore') : t('archive')}
            </button>
            {state.episodes[0] && (
              <Link
                className={`${control} inline-flex items-center`}
                href={`/assets/${state.episodes[0].projectId}?scope=series`}
              >
                {t('shared')}
              </Link>
            )}
          </div>
          <ol className="grid gap-3 md:grid-cols-2">
            {state.episodes.map((episode, index) => (
              <li
                key={episode.id}
                className="rounded-xl border border-white/10 p-4"
              >
                <Link
                  className="block min-h-11 text-lg font-medium"
                  href={`/canvas/${episode.projectId}`}
                >
                  {index + 1}. {episode.label || episode.name}
                </Link>
                <p className="text-sm text-white/50">{t('episodeProject')}</p>
                <button
                  className={`${control} mt-3`}
                  disabled={busy || index === 0 || Boolean(state.archivedAt)}
                  onClick={() =>
                    void run(() => {
                      const ids = state.episodes.map((e) => e.id);
                      [ids[index - 1], ids[index]] = [
                        ids[index],
                        ids[index - 1],
                      ];
                      return seriesCommand(state.id, state.revision, {
                        type: 'set_episode_order',
                        episodeIds: ids,
                      });
                    })
                  }
                >
                  {t('moveUp')}
                </button>
                <button
                  className={`${control} mt-3`}
                  disabled={busy}
                  onClick={() =>
                    void run(async () =>
                      setDetach(
                        await apiJsonPost(
                          `/api/app/series/${state.id}/reference-review`,
                          {
                            action: 'preview',
                            request: {
                              seriesId: state.id,
                              mode: 'detach',
                              projectId: episode.projectId,
                            },
                          },
                        ),
                      ),
                    )
                  }
                >
                  {t('previewDetach')}
                </button>
              </li>
            ))}
          </ol>
          {detach && (
            <div className="rounded-xl border border-orange-500/40 p-4">
              <p>{t('detachDescription', { count: detach.changes.length })}</p>
              {detach.blockers.map((b) => (
                <p role="alert" key={b}>
                  {b}
                </p>
              ))}
              <button
                className={control}
                disabled={busy || Boolean(detach.blockers.length)}
                onClick={() =>
                  void run(async () => {
                    const commandId = crypto.randomUUID();
                    await apiJsonPost(
                      `/api/app/series/${state.id}/reference-review`,
                      {
                        action: 'apply',
                        commandId,
                        idempotencyKey: commandId,
                        expectedRevision: detach.seriesRevision,
                        previewToken: detach.previewToken,
                      },
                    );
                    setDetach(null);
                  })
                }
              >
                {t('confirmDetach')}
              </button>
            </div>
          )}
          {!state.archivedAt && (
            <>
              <form
                className="flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(() => attach(projectId));
                }}
              >
                <select
                  className={`${control} max-w-full`}
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  aria-label={t('chooseProject')}
                >
                  <option value="">{t('chooseProject')}</option>
                  {projects.data?.projects
                    .filter(
                      (p) =>
                        !state.episodes.some((ep) => ep.projectId === p.id),
                    )
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
                <button className={control} disabled={busy || !projectId}>
                  {t('attachEpisode')}
                </button>
              </form>
              <form
                className="flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    const created = await apiJsonPost<{ id: string }>(
                      '/api/app/projects/',
                      { name, workspaceMode: 'canvas' },
                    );
                    await attach(created.id);
                  });
                }}
              >
                <input
                  className={control}
                  value={name}
                  maxLength={120}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('episodeName')}
                  aria-label={t('episodeName')}
                />
                <button className={control} disabled={busy || !name.trim()}>
                  {t('newEpisode')}
                </button>
              </form>
              <form
                className="flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(() =>
                    seriesCommand(state.id, state.revision, {
                      type: 'update',
                      ...settings,
                    }),
                  );
                }}
              >
                <input
                  className={control}
                  aria-label={t('seriesName')}
                  value={settings.name}
                  maxLength={120}
                  onChange={(e) =>
                    setSettings((v) => ({ ...v, name: e.target.value }))
                  }
                />
                <textarea
                  className={control}
                  aria-label={t('seriesDescription')}
                  value={settings.description}
                  maxLength={1000}
                  onChange={(e) =>
                    setSettings((v) => ({ ...v, description: e.target.value }))
                  }
                />
                <button
                  className={control}
                  disabled={busy || !settings.name.trim()}
                >
                  {t('renameSeries')}
                </button>
              </form>
            </>
          )}
        </>
      ) : (
        <p>{t('loading')}</p>
      )}
    </section>
  );
}
