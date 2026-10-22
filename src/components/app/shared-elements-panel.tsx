import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useTranslations } from '@/core/workspace-lib/shims/next-intl';
import { apiJsonGet, apiJsonPost } from '@/lib/api-client';
import {
  useWorkspaceScope,
  useScopeNavigation,
  scopeSearch,
} from './workspace-scope';
import type {
  getSharedLibrary,
  SharedCommand,
  querySharedConsumers,
  previewSharedArchive,
} from '@/core/series/shared-assets';
import type { previewReferenceReview } from '@/core/series/reference-review';
import type { queryScopedAssets } from '@/core/series/asset-query';
import { toast } from 'sonner';

type Library = Awaited<ReturnType<typeof getSharedLibrary>>;
type PublicPreview = Omit<
  Awaited<ReturnType<typeof previewReferenceReview>>,
  'groups' | 'organizations' | 'observed'
>;
const control =
  'min-h-11 rounded-lg border border-white/15 bg-white/5 px-3 text-sm focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-40';
export function SharedElementsPanel({
  projectId,
  onChanged,
}: {
  projectId: string;
  onChanged?: () => void;
}) {
  const scope = useWorkspaceScope();
  const t = useTranslations('Series');
  const navigate = useScopeNavigation();
  const seriesId = scope?.narrative.episode?.seriesId;
  const [elementId, setElementId] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'character' | 'scene' | 'prop' | 'voice'>(
    'character',
  );
  const [assetId, setAssetId] = useState('');
  const [assetSearch, setAssetSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<PublicPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [archivePreview, setArchivePreview] = useState<Omit<
    Awaited<ReturnType<typeof previewSharedArchive>>,
    'observed'
  > | null>(null);
  const consumerQuery = useInfiniteQuery({
    queryKey: ['shared-consumers', seriesId, elementId],
    queryFn: ({ pageParam, signal }) =>
      apiJsonGet<Awaited<ReturnType<typeof querySharedConsumers>>>(
        `/api/app/series/${seriesId}/consumers?elementId=${encodeURIComponent(elementId)}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
        { signal },
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled: Boolean(seriesId && elementId),
  });
  const consumers = consumerQuery.data?.pages.flatMap((p) => p.consumers) ?? [];
  const library = useQuery({
    queryKey: ['shared-elements', seriesId],
    queryFn: () => apiJsonGet<Library>(`/api/app/series/${seriesId}/shared`),
    enabled: Boolean(seriesId),
    refetchInterval: 5000,
  });
  const assets = useQuery({
    queryKey: ['shared-publish-assets', projectId, assetSearch, kind],
    queryFn: ({ signal }) =>
      apiJsonGet<Awaited<ReturnType<typeof queryScopedAssets>>>(
        `/api/app/projects/${projectId}/scoped-assets?scope=episode&mediaType=${kind === 'voice' ? 'audio' : 'image'}&query=${encodeURIComponent(assetSearch)}`,
        { signal },
      ),
    enabled: Boolean(seriesId),
  });
  if (!seriesId) return null;
  const state = library.data;
  const element = state?.elements.find((e) => e.id === elementId);
  const current = element?.versions.find(
    (v) => v.id === element.currentVersionId,
  );
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await library.refetch();
      await consumerQuery.refetch();
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }
  const mutate = (command: SharedCommand) => {
    const commandId = crypto.randomUUID();
    return apiJsonPost<Library>(`/api/app/series/${seriesId}/shared`, {
      commandId,
      idempotencyKey: commandId,
      expectedRevision: state!.revision,
      command,
    });
  };
  async function review(mode: 'adopt' | 'keep' | 'localize') {
    if (!element) return;
    const chosen = consumers
      .filter((c) => selected.includes(c.id))
      .map((c) => ({
        projectId: c.projectId,
        canvasId: c.canvasId,
        bindingId: c.bindingId,
      }));
    const data = await apiJsonPost<PublicPreview>(
      `/api/app/series/${seriesId}/reference-review`,
      {
        action: 'preview',
        request: {
          seriesId,
          mode,
          elementId: element.id,
          targetVersionId: element.currentVersionId,
          selectedConsumers: chosen,
        },
      },
    );
    setPreview(data);
  }
  return (
    <section
      className="mt-6 space-y-4 rounded-xl border border-white/10 bg-white/[0.02] p-4"
      aria-label={t('sharedElements')}
    >
      <h2 className="font-semibold">{t('sharedElements')}</h2>
      <p className="text-sm text-white/55">{t('fixedVersionDescription')}</p>
      {library.isError && <p role="alert">{t('failed')}</p>}
      <div className="flex flex-wrap gap-3">
        <select
          className={`${control} max-w-full`}
          aria-label={t('chooseElement')}
          value={elementId}
          onChange={(e) => {
            setElementId(e.target.value);
            const item = state?.elements.find((v) => v.id === e.target.value);
            if (item) setKind(item.kind as typeof kind);
            setArchivePreview(null);
            setPreview(null);
            setSelected([]);
          }}
        >
          <option value="">{t('chooseElement')}</option>
          {state?.elements
            .filter((e) => showArchived || !e.archivedAt)
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
                {e.archivedAt ? ` · ${t('archived')}` : ''}
              </option>
            ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          {t('showArchived')}
        </label>
      </div>
      {element && (
        <>
          <div className="grid gap-4 md:grid-cols-[220px_1fr]">
            <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-black/40">
              {current?.url ? (
                current.mediaType === 'audio' ? (
                  <audio controls src={current.url} className="w-full" />
                ) : (
                  <img
                    src={current.url}
                    alt={element.name}
                    className="h-full w-full object-contain"
                    loading="lazy"
                  />
                )
              ) : (
                t('mediaUnavailable')
              )}
            </div>
            <div className="space-y-2">
              <strong>{element.name}</strong>
              <p className="break-all text-sm text-white/60">
                {t('recommendedVersion')} · {current?.ordinal ?? '—'}
              </p>
              <div className="flex flex-wrap gap-2">
                {element.versions.map((v) => (
                  <button
                    key={v.id}
                    className={control}
                    disabled={
                      busy ||
                      v.id === element.currentVersionId ||
                      Boolean(element.archivedAt)
                    }
                    onClick={() =>
                      void run(() =>
                        mutate({
                          type: 'set_current',
                          elementId: element.id,
                          observedCurrentVersionId: element.currentVersionId,
                          versionId: v.id,
                        }),
                      )
                    }
                  >
                    {t('recommendVersion', { version: v.ordinal })}
                  </button>
                ))}
              </div>
              <p className="text-sm text-white/50">
                {t('versionDoesNotReplaceClips')}
              </p>
            </div>
          </div>
          <details>
            <summary className="min-h-11 cursor-pointer py-3">
              {t('consumers')} ·{' '}
              {consumerQuery.data?.pages[0].total ?? element.consumerCount}
            </summary>
            <label className="my-2 flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={
                  consumers.length > 0 && selected.length === consumers.length
                }
                onChange={(e) => {
                  setSelected(
                    e.target.checked ? consumers.map((c) => c.id) : [],
                  );
                  setPreview(null);
                }}
              />
              {t('selectAll')}
            </label>
            <ul className="max-h-80 space-y-2 overflow-y-auto">
              {consumers.map((c) => (
                <li
                  key={c.id}
                  className="flex items-start gap-2 rounded-lg border border-white/10 p-2"
                >
                  <input
                    type="checkbox"
                    className="mt-3"
                    checked={selected.includes(c.id)}
                    aria-label={`${t('selectConsumer')} ${c.consumerCardId}`}
                    onChange={(e) => {
                      setSelected((old) =>
                        e.target.checked
                          ? [...old, c.id]
                          : old.filter((id) => id !== c.id),
                      );
                      setPreview(null);
                    }}
                  />
                  <button
                    className={`${control} min-w-0 flex-1 text-left`}
                    onClick={() =>
                      void navigate(
                        `/canvas/${c.projectId}${scopeSearch({ canvasId: c.canvasId })}&focus=${encodeURIComponent(c.consumerCardId)}`,
                      )
                    }
                  >
                    <span className="block truncate">{c.consumerCardId}</span>
                    <span className="block break-all text-xs text-white/50">
                      {c.projectId === projectId
                        ? t('thisEpisode')
                        : t('otherEpisode')}{' '}
                      ·{' '}
                      {element.versions.find((v) => v.id === c.versionId)
                        ?.ordinal ?? c.versionId}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {consumerQuery.hasNextPage && (
              <button
                className={control}
                disabled={consumerQuery.isFetchingNextPage}
                onClick={() => void consumerQuery.fetchNextPage()}
              >
                {t('loadMore')}
              </button>
            )}
            {consumerQuery.isError && <p role="alert">{t('queryChanged')}</p>}
          </details>
          <div className="flex flex-wrap gap-2">
            <button
              className={control}
              disabled={
                busy ||
                !selected.length ||
                selected.length > 100 ||
                Boolean(element.archivedAt)
              }
              onClick={() => void run(() => review('adopt'))}
            >
              {t('previewAdoption', { count: selected.length })}
            </button>
            <button
              className={control}
              disabled={busy || !selected.length}
              onClick={() => void run(() => review('keep'))}
            >
              {t('keepVersion')}
            </button>
            <button
              className={control}
              disabled={busy || !selected.length}
              onClick={() => void run(() => review('localize'))}
            >
              {t('localize')}
            </button>
          </div>
          {preview && (
            <div
              className="space-y-3 rounded-xl border border-orange-500/40 p-4"
              aria-label={t('reviewChanges')}
            >
              <strong>{t('reviewChanges')}</strong>
              <p>{t('affectedInputs', { count: preview.changes.length })}</p>
              <ul className="max-h-52 overflow-y-auto text-sm text-white/60">
                {preview.changes.map((c) => (
                  <li
                    key={`${c.projectId}:${c.canvasId}:${c.bindingId}`}
                    className="break-all"
                  >
                    {c.consumerCardId} · {c.fromVersionId} → {c.toVersionId}
                  </li>
                ))}
              </ul>
              {preview.blockers.map((b) => (
                <p key={b} role="alert">
                  {b}
                </p>
              ))}
              <button
                className={control}
                disabled={busy || preview.blockers.length > 0}
                onClick={() =>
                  void run(async () => {
                    const commandId = crypto.randomUUID();
                    await apiJsonPost(
                      `/api/app/series/${seriesId}/reference-review`,
                      {
                        action: 'apply',
                        commandId,
                        idempotencyKey: commandId,
                        expectedRevision: preview.seriesRevision,
                        previewToken: preview.previewToken,
                      },
                    );
                    setPreview(null);
                    setSelected([]);
                  })
                }
              >
                {t('confirmReview')}
              </button>
            </div>
          )}
          <details>
            <summary className="min-h-11 cursor-pointer py-3">
              {t('archiveElement')}
            </summary>
            <p className="my-3 text-sm text-white/55">
              {t('archiveKeepsPins', { count: element.consumerCount })}
            </p>
            {element.archivedAt ? (
              <button
                className={control}
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    mutate({
                      type: 'archive_element',
                      elementId: element.id,
                      archived: false,
                    }),
                  )
                }
              >
                {t('restore')}
              </button>
            ) : (
              <>
                <button
                  className={control}
                  disabled={busy}
                  onClick={() =>
                    void run(async () =>
                      setArchivePreview(
                        await apiJsonPost(
                          `/api/app/series/${seriesId}/archive-preview`,
                          { elementId: element.id },
                        ),
                      ),
                    )
                  }
                >
                  {t('previewArchive')}
                </button>
                {archivePreview && (
                  <button
                    className={control}
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const commandId = crypto.randomUUID();
                        await apiJsonPost(
                          `/api/app/series/${seriesId}/shared`,
                          {
                            commandId,
                            idempotencyKey: commandId,
                            expectedRevision: archivePreview.seriesRevision,
                            command: {
                              type: 'archive_element',
                              elementId: element.id,
                              archived: true,
                              previewToken: archivePreview.previewToken,
                            },
                          },
                        );
                        setArchivePreview(null);
                      })
                    }
                  >
                    {t('confirmArchive')}
                  </button>
                )}
              </>
            )}
          </details>
        </>
      )}
      {!state?.archivedAt && (
        <details>
          <summary className="min-h-11 cursor-pointer py-3">
            {t('publishReference')}
          </summary>
          <div className="flex flex-wrap gap-2">
            <select
              className={control}
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as typeof kind);
                setAssetId('');
              }}
              aria-label={t('referenceKind')}
            >
              {(['character', 'scene', 'prop', 'voice'] as const).map((k) => (
                <option value={k} key={k}>
                  {t(k)}
                </option>
              ))}
            </select>
            <input
              className={control}
              value={assetSearch}
              onChange={(e) => setAssetSearch(e.target.value)}
              placeholder={t('assetSearch')}
              aria-label={t('assetSearch')}
            />
            <select
              className={`${control} max-w-full`}
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              aria-label={t('chooseAsset')}
            >
              <option value="">{t('chooseAsset')}</option>
              {assets.data?.assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.filename ?? a.id}
                </option>
              ))}
            </select>
          </div>
          <form
            className="mt-3 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const id = crypto.randomUUID();
                await mutate({
                  type: 'publish_element',
                  elementId: id,
                  versionId: crypto.randomUUID(),
                  name,
                  kind,
                  sourceProjectId: projectId,
                  assetId,
                });
                setName('');
                setElementId(id);
              });
            }}
          >
            <input
              className={control}
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('elementName')}
              aria-label={t('elementName')}
            />
            <button
              className={control}
              disabled={busy || !assetId || !name.trim()}
            >
              {t('publishReference')}
            </button>
            {element && !element.archivedAt && (
              <button
                type="button"
                className={control}
                disabled={busy || !assetId}
                onClick={() =>
                  void run(() =>
                    mutate({
                      type: 'add_version',
                      elementId: element.id,
                      versionId: crypto.randomUUID(),
                      sourceProjectId: projectId,
                      assetId,
                    }),
                  )
                }
              >
                {t('addVersion')}
              </button>
            )}
          </form>
        </details>
      )}
    </section>
  );
}
