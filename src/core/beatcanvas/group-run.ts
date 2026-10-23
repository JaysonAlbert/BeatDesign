import type { CanvasCard, CanvasDraftCard } from './canvas-types';

/** Only live generation references imply ordering. A concrete output remains pinned. */
export function planGroupRun(
  cards: Record<string, CanvasCard>,
  memberIds: string[]
) {
  const drafts = [...new Set(memberIds)]
    .map((id) => cards[id])
    .filter((card): card is CanvasDraftCard => card?.kind === 'generation');
  if (!drafts.length) throw new Error('empty');
  if (
    drafts.some(
      (card) => card.status === 'pending' || card.status === 'processing'
    )
  )
    throw new Error('busy');
  const members = new Set(drafts.map((card) => card.id));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: string[] = [];
  function visit(id: string) {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error('cycle');
    visiting.add(id);
    const card = cards[id] as CanvasDraftCard;
    for (const ref of card.referenceCardIds ?? [])
      if (members.has(ref)) visit(ref);
    visiting.delete(id);
    visited.add(id);
    ordered.push(id);
  }
  for (const card of drafts) visit(card.id);
  return ordered;
}

/** Stop the remaining run if the user edits its generation settings. */
export function groupRunFingerprint(card: CanvasCard | undefined) {
  if (!card || card.kind !== 'generation') return null;
  const { status, error, pinnedOutputId, ...configuration } = card;
  return JSON.stringify(configuration);
}
