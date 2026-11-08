import type { CanvasCard } from '@/core/beatcanvas/canvas-types';
import { resolveConcreteCanvasMediaCard } from '@/core/beatcanvas/generation-history';
import type { ProjectSnapshotDocument } from '@/core/projects/project-snapshot';
import { apiJsonGet } from '@/lib/api-client';

export const canvasDirectoryHref = (projectId: string) =>
  `/canvas/${encodeURIComponent(projectId)}?view=directory`;

export function canvasDocumentHref(projectId: string, canvasId: string, sceneId?: string | null) {
  const search = new URLSearchParams({ canvasId });
  if (sceneId) search.set('sceneId', sceneId);
  return `/canvas/${encodeURIComponent(projectId)}?${search}`;
}

export const sceneCanvasHref = (projectId: string, sceneId: string) =>
  `/canvas/${encodeURIComponent(projectId)}?${new URLSearchParams({ sceneId })}`;

export const sceneAssetsHref = (projectId: string, sceneId: string) =>
  `/assets/${encodeURIComponent(projectId)}?${new URLSearchParams({ scope: 'scene', sceneId })}`;

export const fetchDirectoryCanvas = (projectId: string, canvasId: string) =>
  apiJsonGet<{ version: number; document: ProjectSnapshotDocument }>(
    `/api/app/projects/${encodeURIComponent(projectId)}/snapshot?${new URLSearchParams({ canvasId })}`
  );

/** Counts concrete current media once, without treating historical takes as new shots. */
export function summarizeDirectoryCanvas(document: ProjectSnapshotDocument) {
  const cards = Object.fromEntries(document.cards.map((card) => [card.id, card]));
  const current = document.cards.filter((card) =>
    card.kind !== 'output' || !cards[card.sourceConfigCardId ?? '']
  );
  const media = new Map<string, CanvasCard>();
  for (const card of current) {
    const concrete = resolveConcreteCanvasMediaCard({ cards, card });
    if (concrete?.url && ['image', 'video', 'audio'].includes(concrete.type)) {
      media.set(concrete.assetId ?? concrete.url, concrete);
    }
  }
  const contents = [...media.values()];
  const text = current.filter((card) => card.type === 'text');
  const active = new Set(document.cards.filter((card) =>
    card.status === 'pending' || card.status === 'processing'
  ).map((card) => card.sourceConfigCardId ?? card.id)).size;
  return {
    images: contents.filter((card) => card.type === 'image').length,
    videos: contents.filter((card) => card.type === 'video').length,
    audio: contents.filter((card) => card.type === 'audio').length,
    text: text.length,
    timelines: current.filter((card) => card.type === 'timeline').length,
    active,
    nodes: current.length,
    previews: contents.filter((card) => card.type === 'image' || card.type === 'video')
      .sort((a, b) => Number(b.type === 'video') - Number(a.type === 'video')).slice(0, 3),
    excerpt: text[0]?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 140) ?? '',
  };
}
