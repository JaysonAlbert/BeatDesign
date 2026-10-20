import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiJsonGet } from '@/lib/api-client';
import { useTranslations } from '@/core/workspace-lib/shims/next-intl';
import { useScopeNavigation } from './workspace-scope';
import type { getScopedAssetDetails } from '@/core/series/asset-details';
type Detail = Awaited<ReturnType<typeof getScopedAssetDetails>>;
const control =
  'min-h-11 rounded-lg border border-white/15 bg-white/5 px-3 text-sm focus-visible:ring-2 focus-visible:ring-orange-500';
export function SeriesAssetDetails({
  projectId,
  assetId,
  seriesId,
  onClose,
}: {
  projectId: string;
  assetId: string;
  seriesId?: string;
  onClose: () => void;
}) {
  const t = useTranslations('Series');
  const navigate = useScopeNavigation();
  const [currentId, setCurrentId] = useState(assetId);
  const [historyOffset, setHistoryOffset] = useState(0);
  const query = useQuery({
    queryKey: [
      'series-asset-detail',
      projectId,
      currentId,
      seriesId,
      historyOffset,
    ],
    queryFn: ({ signal }) =>
      apiJsonGet<Detail>(
        `/api/app/projects/${projectId}/asset-details/${encodeURIComponent(currentId)}?historyOffset=${historyOffset}${seriesId ? `&seriesId=${seriesId}` : ''}`,
        { signal },
      ),
  });
  const data = query.data;
  const choose = (id: string) => {
    setCurrentId(id);
    setHistoryOffset(0);
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto bg-[#131416] text-white">
        <DialogHeader>
          <DialogTitle>{data?.asset.filename || t('assetDetails')}</DialogTitle>
        </DialogHeader>
        {query.isError && <p role="alert">{t('mediaUnavailable')}</p>}
        {data && (
          <>
            <div className="flex max-h-[45vh] items-center justify-center rounded-lg bg-black/50">
              {data.asset.type === 'video' ? (
                <video
                  controls
                  src={data.asset.url}
                  className="max-h-[45vh] w-full"
                />
              ) : data.asset.type === 'audio' ? (
                <audio controls src={data.asset.url} />
              ) : (
                <img
                  src={data.asset.url}
                  alt={data.asset.filename || data.asset.id}
                  className="max-h-[45vh] max-w-full object-contain"
                />
              )}
            </div>
            {data.sourceLocator && (
              <button
                className={control}
                onClick={() => {
                  const source = data.sourceLocator!;
                  void navigate(
                    `/canvas/${source.projectId}?canvasId=${encodeURIComponent(source.canvasId)}&focus=${encodeURIComponent(source.cardId)}`,
                  );
                }}
              >
                {data.sourceLocator.moved
                  ? t('locateMovedStep')
                  : t('locateStep')}
              </button>
            )}
            <section className="space-y-2">
              <h3>{t('fixedVersion')}</h3>
              {data.elementVersions.map((v) => (
                <p
                  key={`${v.scope}:${v.elementId}:${v.versionId}`}
                  className="break-all text-sm text-white/60"
                >
                  {v.name} · {v.kind} · {v.versionId}{' '}
                  {v.archivedAt ? t('archived') : ''}
                </p>
              ))}
            </section>
            <section className="space-y-2">
              <h3 className="font-medium">{t('batchResults')}</h3>
              {data.batches.length ? (
                data.batches.map((batch) => (
                  <div
                    key={batch.generationId}
                    className="flex flex-wrap gap-2"
                  >
                    {batch.results.map((result, i) => (
                      <button
                        key={result.id}
                        className={control}
                        onClick={() => choose(result.id)}
                        aria-pressed={result.id === currentId}
                      >
                        {i + 1}/{batch.results.length} ·{' '}
                        {result.filename || result.id}
                      </button>
                    ))}
                  </div>
                ))
              ) : (
                <p className="text-sm text-white/50">{t('noBatch')}</p>
              )}
            </section>
            <section className="space-y-2">
              <h3 className="font-medium">{t('historicalTakes')}</h3>
              {data.historyUnavailable ? (
                <p className="text-sm text-white/50">{t('historyUnknown')}</p>
              ) : (
                <>
                  <ul className="max-h-44 space-y-1 overflow-y-auto">
                    {data.history.map((take) => (
                      <li key={take.id}>
                        <button
                          className={`${control} w-full text-left disabled:opacity-40`}
                          disabled={!take.asset}
                          onClick={() => take.asset && choose(take.asset.id)}
                        >
                          {take.createdAt} · {take.status} ·{' '}
                          {take.asset?.filename || t('noMediaResult')}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="flex gap-2">
                    {historyOffset > 0 && (
                      <button
                        className={control}
                        onClick={() =>
                          setHistoryOffset((n) => Math.max(0, n - 100))
                        }
                      >
                        {t('previousPage')}
                      </button>
                    )}
                    {data.historyHasMore && (
                      <button
                        className={control}
                        onClick={() => setHistoryOffset((n) => n + 100)}
                      >
                        {t('nextPage')}
                      </button>
                    )}
                  </div>
                </>
              )}
            </section>
            <section className="space-y-2">
              <h3 className="font-medium">{t('timelineAdoption')}</h3>
              <p className="text-xs text-white/50">{t('thisEpisodeUsage')}</p>
              {!data.clips.length ? (
                <p>{t('notInTimeline')}</p>
              ) : (
                data.clips.map((clip) => (
                  <button
                    key={clip.clipId}
                    className={`${control} block w-full text-left`}
                    onClick={() =>
                      void navigate(
                        `/editor/${projectId}?clipId=${encodeURIComponent(clip.clipId)}${clip.sceneId ? `&sceneId=${clip.sceneId}` : ''}`,
                      )
                    }
                  >
                    {clip.name} ·{' '}
                    {t('clipRange', {
                      start: clip.timelineStart.toFixed(2),
                      in: clip.sourceIn.toFixed(2),
                      out: clip.sourceOut.toFixed(2),
                    })}
                    {clip.takeId ? ` · ${t('take')}` : ''}
                  </button>
                ))
              )}
            </section>
            <section>
              <h3>{t('consumers')}</h3>
              {data.consumers.map((c) => (
                <button
                  key={c.id}
                  className={control}
                  onClick={() =>
                    void navigate(
                      `/canvas/${c.projectId}?canvasId=${encodeURIComponent(c.canvasId)}&focus=${encodeURIComponent(c.consumerCardId)}`,
                    )
                  }
                >
                  {c.consumerCardId} · {c.versionId}
                </button>
              ))}
              {data.consumersTruncated && <p>{t('consumerListTruncated')}</p>}
            </section>
            {data.prompt && (
              <details>
                <summary className="min-h-11 cursor-pointer py-3">
                  {t('frozenPrompt')}
                </summary>
                <p className="whitespace-pre-wrap break-words text-sm text-white/60">
                  {data.prompt}
                </p>
              </details>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
