import { useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { ArrowRight, FileText, Images, Search, Workflow } from 'lucide-react';
import { useTranslations } from '@/core/workspace-lib/shims/next-intl';
import { defaultCanvasId } from '@/core/projects/canvas-identity';
import { useScopeNavigation, useWorkspaceScope } from './workspace-scope';
import { canvasDocumentHref, fetchDirectoryCanvas, sceneAssetsHref, summarizeDirectoryCanvas } from './canvas-directory-model';

export function CanvasDirectory() {
  const scope = useWorkspaceScope();
  const navigate = useScopeNavigation();
  const t = useTranslations('Production');
  const seriesT = useTranslations('Series');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(12);
  const scenes = scope?.narrative.scenes.filter((scene) => !scene.archivedAt) ?? [];
  const all = scope?.narrative.canvases.filter((canvas) =>
    !canvas.archivedAt && (!canvas.sceneId || scenes.some((scene) => scene.id === canvas.sceneId))
  ) ?? [];
  const filtered = all.filter((canvas) =>
    `${canvas.name} ${scenes.find((scene) => scene.id === canvas.sceneId)?.name ?? ''}`
      .toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  ).sort((a, b) => {
    const position = (id: string | null) => id ? scenes.findIndex((scene) => scene.id === id) : scenes.length;
    return position(a.sceneId) - position(b.sceneId) || a.orderKey - b.orderKey;
  });
  const visible = filtered.slice(0, limit);
  const queries = useQueries({ queries: visible.map((canvas) => ({
    queryKey: ['canvas-directory', scope!.projectId, canvas.id],
    queryFn: () => fetchDirectoryCanvas(scope!.projectId, canvas.id),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  })) });
  if (!scope) return null;
  const entries = visible.map((canvas, index) => ({
    canvas, query: queries[index],
    summary: queries[index].data ? summarizeDirectoryCanvas(queries[index].data.document) : null,
  })).filter(({ canvas, summary }) =>
    canvas.id !== defaultCanvasId(scope.projectId) || !summary || summary.nodes > 0
  );
  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-[#08090a] p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{t('canvasDirectory')}</h1>
            <p className="mt-2 text-sm text-white/50">{t('canvasDirectoryHint')}</p>
          </div>
          <button className="min-h-11 rounded-lg border border-white/15 px-4 text-sm hover:bg-white/5" onClick={() => void navigate(`/studio/${scope.projectId}?panel=scenes`)}>{t('manageScenes')}</button>
        </header>
        <label className="flex max-w-md items-center gap-3 rounded-lg border border-white/15 bg-white/5 px-3">
          <Search size={16} className="text-white/45" />
          <input className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" aria-label={t('searchCanvases')} placeholder={t('searchCanvases')} value={search} onChange={(event) => { setSearch(event.target.value); setLimit(12); }} />
        </label>
        {([true, false] as const).map((sceneSection) => {
          const members = entries.filter(({ canvas }) => Boolean(canvas.sceneId) === sceneSection);
          if (!members.length) return null;
          return (
            <section key={String(sceneSection)} className="space-y-4" aria-label={t(sceneSection ? 'sceneCanvases' : 'otherCanvases')}>
              <h2 className="text-base font-semibold">{t(sceneSection ? 'sceneCanvases' : 'otherCanvases')}</h2>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                {members.map(({ canvas, query, summary }) => {
                  const scene = scenes.find((item) => item.id === canvas.sceneId);
                  const name = canvas.name === 'Project canvas' ? seriesT('projectCanvas') : canvas.name;
                  const href = canvasDocumentHref(scope.projectId, canvas.id, canvas.sceneId);
                  return (
                    <article key={canvas.id} className="overflow-hidden rounded-xl border border-white/10 bg-[#111214]">
                      <button className="block w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500" onClick={() => void navigate(href)} aria-label={t('openCanvas', { name })}>
                        <div className="flex aspect-video gap-1 overflow-hidden bg-black/30 p-2">
                          {summary?.previews.length ? summary.previews.map((card) => (
                            <img key={card.id} src={card.type === 'video' && card.assetId ? `/api/app/projects/${encodeURIComponent(scope.projectId)}/assets/${encodeURIComponent(card.assetId)}/thumbnail` : card.url!} alt={card.name} loading="lazy" className="h-full min-w-0 flex-1 object-contain" />
                          )) : <div className="flex w-full flex-col items-center justify-center gap-3 px-5 text-white/35"><FileText size={28} /><p className="line-clamp-3 text-sm">{summary?.excerpt || t(query.isPending ? 'loading' : query.isError ? 'canvasPreviewUnavailable' : 'emptyCanvas')}</p></div>}
                        </div>
                        <div className="space-y-2 p-4">
                          <p className="text-xs text-white/45">{scene?.name ?? t('otherCanvases')}</p>
                          <h3 className="truncate text-base font-semibold" title={name}>{name}</h3>
                          {summary ? <p className="text-xs leading-6 text-white/55">{t('canvasContents', { images: summary.images, videos: summary.videos, audio: summary.audio, text: summary.text, timelines: summary.timelines })}</p> : <p className="text-xs text-white/45">{t(query.isError ? 'canvasPreviewUnavailable' : 'loading')}</p>}
                          {summary && summary.active > 0 && <p className="text-xs text-orange-400">{t('canvasGenerating', { count: summary.active })}</p>}
                          <span className="flex items-center gap-2 pt-1 text-sm text-white/75"><Workflow size={14} />{t('openCanvas', { name: '' })}<ArrowRight size={14} /></span>
                        </div>
                      </button>
                      {scene && <button className="flex min-h-11 w-full items-center gap-2 border-t border-white/10 px-4 text-xs text-white/55 hover:bg-white/5" onClick={() => void navigate(sceneAssetsHref(scope.projectId, scene.id))}><Images size={14} />{t('sceneAssets', { name: scene.name })}</button>}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
        {!entries.length && <p className="rounded-xl border border-dashed border-white/15 p-8 text-sm text-white/50">{t(search ? 'noMatchingCanvases' : 'noCanvases')}</p>}
        {filtered.length > limit && <button className="min-h-11 rounded-lg border border-white/15 px-5 text-sm" onClick={() => setLimit((value) => value + 12)}>{t('moreCanvases')}</button>}
      </div>
    </main>
  );
}
