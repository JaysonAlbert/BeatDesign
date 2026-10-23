import { useState } from 'react';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { Video, AudioLines } from 'lucide-react';
import { useRouter } from '@/core/i18n/navigation';
import { useTranslations } from '@/core/workspace-lib/shims/next-intl';
import { apiJsonGet, apiJsonPost } from '@/lib/api-client';
import { useWorkspaceScope } from './workspace-scope';
import { SharedElementsPanel } from './shared-elements-panel';
import { SeriesAssetDetails } from './series-asset-details';
import { fetchNarrative, narrativeCommand } from '@/core/series/client';
import type { queryScopedAssets } from '@/core/series/asset-query';
import type { ProjectOrganizationDocument } from '@/core/organization/organization-document';
import {
  fetchProjectSettings,
  saveProjectSettings,
} from '@/core/workspace-lib/app/project-settings-client';
import { toast } from 'sonner';
type Page = Awaited<ReturnType<typeof queryScopedAssets>>;
const control =
  'min-h-9 rounded-lg border border-white/10 bg-white/[0.025] px-3 text-sm focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-40';
export function ScopedAssetsBoard({ projectId }: { projectId: string }) {
  const context = useWorkspaceScope();
  const router = useRouter();
  const t = useTranslations('Series');
  const productionT = useTranslations('Production');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const client = useQueryClient();
  const search = useSearch({ strict: false }) as Record<
    string,
    string | undefined
  >;
  const scope = search.scope ?? (context?.sceneId ? 'scene' : 'episode');
  const [archivePreview, setArchivePreview] = useState<{
    assetId: string;
    previewToken: string;
    seriesRevision: number;
    consumers: unknown[];
  } | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seriesId = context?.narrative.episode?.seriesId;
  const enabled = scope !== 'scene' || Boolean(context?.sceneId);
  const allowed = enabled && (scope !== 'series' || Boolean(seriesId));
  const params = new URLSearchParams({
    scope,
    limit: '100',
    query: search.q ?? '',
  });
  if (scope === 'scene' && context?.sceneId)
    params.set('sceneId', context.sceneId);
  if (scope === 'series' && seriesId) params.set('seriesId', seriesId);
  for (const key of ['mediaType', 'elementKind', 'usage'] as const)
    if (search[key]) params.set(key, search[key]!);
  if (scope !== 'series' && search.folderId)
    params.set('folderId', search.folderId);
  if (scope === 'series' && search.includeArchived)
    params.set('includeArchived', search.includeArchived);
  const key = ['scoped-assets', projectId, params.toString()] as const;
  const assets = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam, signal }) =>
      apiJsonGet<Page>(
        `/api/app/projects/${projectId}/scoped-assets?${params}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
        { signal }
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled: allowed,
    retry: false,
  });
  const organization = useQuery({
    queryKey: ['asset-board-folders', projectId],
    queryFn: () =>
      apiJsonGet<{ document: ProjectOrganizationDocument }>(
        `/api/app/projects/${projectId}/organization`
      ),
    enabled: scope !== 'series',
  });
  const rows = assets.data?.pages.flatMap((page) => page.assets) ?? [];
  function update(values: Record<string, string | undefined>) {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...search, ...values }))
      if (value) next.set(key, value);
    router.replace(`/assets/${projectId}?${next}`);
  }
  async function action(run: () => Promise<unknown>) {
    setBusy(true);
    try {
      await run();
      await client.invalidateQueries({
        queryKey: ['scoped-assets', projectId],
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }
  async function sharedWrite(command: unknown, revision?: number) {
    const state =
      revision === undefined
        ? await apiJsonGet<{ revision: number }>(`/api/app/series/${seriesId}`)
        : { revision };
    const commandId = crypto.randomUUID();
    await apiJsonPost(`/api/app/series/${seriesId}/shared`, {
      commandId,
      idempotencyKey: commandId,
      expectedRevision: state.revision,
      command,
    });
  }
  return (
    <section className="mt-6 space-y-4" aria-label={t('assetBoard')}>
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label={t('assetScope')}
      >
        {(['scene', 'episode', 'series'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={`${control} ${scope === value ? 'border-white/20 bg-white/10 text-white' : '!border-transparent !bg-transparent text-white/45'}`}
            aria-pressed={scope === value}
            disabled={
              (value === 'scene' && !context?.sceneId) ||
              (value === 'series' && !seriesId)
            }
            onClick={() => update({ scope: value, folderId: undefined })}
          >
            {t(`scope_${value}`)}
          </button>
        ))}
      </div>
      {!allowed && (
        <p role="status">
          {scope === 'series' ? t('noSeries') : t('chooseScene')}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <input
          className={`${control} min-w-48 flex-1`}
          value={search.q ?? ''}
          onChange={(e) => update({ q: e.target.value || undefined })}
          placeholder={t('assetSearch')}
          aria-label={t('assetSearch')}
        />
        <select
          className={control}
          aria-label={t('mediaType')}
          value={search.mediaType ?? ''}
          onChange={(e) => update({ mediaType: e.target.value || undefined })}
        >
          <option value="">{t('allMedia')}</option>
          {(['image', 'video', 'audio'] as const).map((value) => (
            <option key={value} value={value}>
              {t(value)}
            </option>
          ))}
        </select>
        <button
          className={control}
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          {productionT('filters')}
          {search.elementKind || search.usage || search.folderId ? ' •' : ''}
        </button>
        {filtersOpen && (
          <>
            <select
              className={control}
              aria-label={t('referenceKind')}
              value={search.elementKind ?? ''}
              onChange={(e) =>
                update({ elementKind: e.target.value || undefined })
              }
            >
              <option value="">{t('allKinds')}</option>
              {(['character', 'scene', 'prop', 'voice', 'other'] as const).map(
                (value) => (
                  <option key={value} value={value}>
                    {t(value)}
                  </option>
                )
              )}
            </select>
            <select
              className={control}
              aria-label={t('usage')}
              value={search.usage ?? ''}
              onChange={(e) => update({ usage: e.target.value || undefined })}
            >
              <option value="">{t('allUses')}</option>
              {(
                ['reference', 'candidate', 'timeline', 'unassigned'] as const
              ).map((value) => (
                <option key={value} value={value}>
                  {t(`usage_${value}`)}
                </option>
              ))}
            </select>
            {scope !== 'series' && (
              <select
                className={control}
                aria-label={t('folder')}
                value={search.folderId ?? ''}
                onChange={(e) =>
                  update({ folderId: e.target.value || undefined })
                }
              >
                <option value="">{t('allFolders')}</option>
                <option value="@unassigned">{t('unfiled')}</option>
                {Object.values(organization.data?.document.folders ?? {}).map(
                  (folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  )
                )}
              </select>
            )}
          </>
        )}
      </div>
      {scope === 'series' && (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={search.includeArchived === 'true'}
            onChange={(e) =>
              update({ includeArchived: e.target.checked ? 'true' : undefined })
            }
          />
          {t('showArchived')}
        </label>
      )}
      {scope === 'series' && (
        <SharedElementsPanel
          projectId={projectId}
          onChanged={() => {
            void client.invalidateQueries({
              queryKey: ['scoped-assets', projectId],
            });
          }}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-white/60">
        <p role="status">
          {assets.data
            ? t('loadedCount', {
                loaded: rows.length,
                total: assets.data.pages[0].total,
              })
            : allowed
              ? t('loading')
              : ''}
        </p>
        <button
          className={control}
          disabled={busy}
          onClick={() =>
            void client.resetQueries({ queryKey: key, exact: true })
          }
        >
          {t('refresh')}
        </button>
      </div>
      {assets.isError && <p role="alert">{t('queryChanged')}</p>}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {rows.map((asset) => (
          <article
            key={asset.id}
            className="min-w-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.025]"
            data-asset-id={asset.id}
          >
            <button
              type="button"
              className="block w-full text-left focus-visible:ring-2 focus-visible:ring-orange-500"
              aria-label={`${t('assetDetails')} ${asset.filename || asset.id}`}
              onClick={() => setDetail(asset.id)}
            >
              <div className="flex aspect-video items-center justify-center overflow-hidden bg-black/30">
                {asset.type === 'image' ? (
                  <img
                    src={asset.publicUrl}
                    alt={asset.filename || asset.id}
                    loading="lazy"
                    className="h-full w-full object-contain"
                  />
                ) : asset.type === 'video' ? (
                  asset.thumbnailUrl ? (
                    <img
                      src={asset.thumbnailUrl}
                      alt={asset.filename || asset.id}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Video className="size-9 text-white/40" />
                  )
                ) : (
                  <AudioLines className="size-9 text-white/40" />
                )}
              </div>
              <div className="space-y-1 p-3">
                <p className="truncate text-sm font-medium">
                  {asset.filename || asset.id}
                </p>
                <p className="text-xs text-white/45">
                  {t(asset.type)} · {t(`source_${asset.source}`)}
                </p>
                {asset.originProjectName && (
                  <p
                    className="truncate text-xs text-white/45"
                    title={asset.originProjectName}
                  >
                    {asset.originProjectName}
                  </p>
                )}
                <p className="text-xs text-white/45">
                  {t('consumers')} · {asset.sharedConsumerCount}
                </p>
                {asset.elementVersions.map((v) => (
                  <p
                    key={`${v.scope}:${v.elementId}:${v.versionId}`}
                    className="truncate text-xs text-orange-300"
                  >
                    {v.name} · {v.versionId}
                    {v.archivedAt ? ` · ${t('archived')}` : ''}
                  </p>
                ))}
                <p className="text-xs text-white/50">
                  {t('adoptedCount', { count: asset.timelineUseCount ?? 0 })}
                </p>
              </div>
            </button>
            <div className="flex flex-wrap gap-2 px-3 pb-3">
              {scope === 'series' ? (
                <>
                  {' '}
                  <button
                    className={control}
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        const library = await apiJsonGet<{ revision: number }>(
                          `/api/app/series/${seriesId}`
                        );
                        const commandId = crypto.randomUUID();
                        await apiJsonPost(
                          `/api/app/series/${seriesId}/shared`,
                          {
                            commandId,
                            idempotencyKey: commandId,
                            expectedRevision: library.revision,
                            command: {
                              type: 'use_assets',
                              projectId,
                              assetIds: [asset.id],
                            },
                          }
                        );
                        toast.success(t('usedInEpisode'));
                      })
                    }
                  >
                    {t('useInEpisode')}
                  </button>
                  <button
                    className={control}
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        if (asset.sharedArchivedAt)
                          await sharedWrite({
                            type: 'archive_assets',
                            assetIds: [asset.id],
                            archived: false,
                          });
                        else {
                          const preview = await apiJsonPost<{
                            previewToken: string;
                            seriesRevision: number;
                            consumers: unknown[];
                          }>(`/api/app/series/${seriesId}/archive-preview`, {
                            assetIds: [asset.id],
                          });
                          setArchivePreview({ ...preview, assetId: asset.id });
                        }
                      })
                    }
                  >
                    {asset.sharedArchivedAt
                      ? t('restore')
                      : t('previewArchive')}
                  </button>
                </>
              ) : (
                <>
                  {seriesId && (
                    <button
                      className={control}
                      disabled={busy}
                      onClick={() =>
                        void action(() =>
                          sharedWrite({
                            type: 'publish_assets',
                            sourceProjectId: projectId,
                            assetIds: [asset.id],
                          })
                        )
                      }
                    >
                      {t('publishAsset')}
                    </button>
                  )}
                  {asset.type === 'image' && (
                    <button
                      className={control}
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          const settings =
                            await fetchProjectSettings(projectId);
                          await saveProjectSettings(
                            projectId,
                            settings.settingsRevision,
                            { cover: { mode: 'manual', assetId: asset.id } }
                          );
                          await client.invalidateQueries({
                            queryKey: ['project-settings', projectId],
                          });
                          toast.success(t('coverSaved'));
                        })
                      }
                    >
                      {t('setCover')}
                    </button>
                  )}
                  {context?.sceneId && (
                    <button
                      className={control}
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          const state = await fetchNarrative(projectId);
                          await narrativeCommand(projectId, state.revision, {
                            type: 'assign_scene_assets',
                            sceneId: context.sceneId!,
                            assetIds: [asset.id],
                          });
                        })
                      }
                    >
                      {t('assignToScene')}
                    </button>
                  )}
                </>
              )}
            </div>
          </article>
        ))}
      </div>
      {allowed && !assets.isLoading && !rows.length && !assets.isError && (
        <p className="py-10 text-center text-white/40">{t('noAssets')}</p>
      )}
      {assets.hasNextPage && (
        <button
          className={control}
          disabled={assets.isFetchingNextPage}
          onClick={() => void assets.fetchNextPage()}
        >
          {t('loadMore')}
        </button>
      )}
      {archivePreview && (
        <section className="rounded-xl border border-orange-500/40 p-4">
          <p>
            {t('archiveKeepsPins', { count: archivePreview.consumers.length })}
          </p>
          <button
            className={control}
            disabled={busy}
            onClick={() =>
              void action(async () => {
                await sharedWrite(
                  {
                    type: 'archive_assets',
                    assetIds: [archivePreview.assetId],
                    archived: true,
                    previewToken: archivePreview.previewToken,
                  },
                  archivePreview.seriesRevision
                );
                setArchivePreview(null);
              })
            }
          >
            {t('confirmArchive')}
          </button>
          <button className={control} onClick={() => setArchivePreview(null)}>
            {t('cancel')}
          </button>
        </section>
      )}
      {detail && (
        <SeriesAssetDetails
          key={detail}
          projectId={projectId}
          assetId={detail}
          seriesId={scope === 'series' ? seriesId : undefined}
          onClose={() => setDetail(null)}
        />
      )}
    </section>
  );
}
