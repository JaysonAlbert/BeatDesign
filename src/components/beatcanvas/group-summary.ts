import type { CanvasCard } from '@/core/beatcanvas/canvas-types';
import { resolveConcreteCanvasMediaCard } from '@/core/beatcanvas/generation-history';
import type { CanvasOrganizationDocument, ShotGroup } from '@/core/organization/canvas-organization';
import { visibleGroupCards } from '@/core/organization/group-layout';

/** Derived from current visible members, never from arbitrary historical takes. */
export function summarizeCanvasGroup(document: CanvasOrganizationDocument, group: ShotGroup) {
  const cards = Object.fromEntries(document.cards.map((card) => [card.id, card]));
  const members = visibleGroupCards(document, group);
  const counts: Record<string, number> = {};
  for (const card of members) {
    const kind = card.kind === 'generation' ? 'generation' : card.type;
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  const ordered = [...members].sort((a, b) =>
    Number(b.id === group.resultCardId) - Number(a.id === group.resultCardId)
  );
  const preview = ordered
    .map((card) => resolveConcreteCanvasMediaCard({ cards, card }))
    .find((card): card is CanvasCard => Boolean(card?.type === 'image' && card.url));
  const text = members.find((card) => card.type === 'text' && card.textContent?.trim());
  const excerpt = text?.textContent?.replace(/^\s*#{1,6}\s+/gm, '').replace(/\s+/g, ' ').trim().slice(0, 180) ?? '';
  return {
    counts,
    members: members.map((card) => ({ id: card.id, name: card.name })),
    preview: preview ? { url: preview.url!, name: preview.name } : null,
    excerpt,
  };
}

export type CanvasGroupSummary = ReturnType<typeof summarizeCanvasGroup>;
