import type {
  CanvasCard,
  CanvasGenerationCard,
  CanvasOutputCard,
} from '@/core/beatcanvas/canvas-types';
import { buildGenerationTakes } from './generation-history';

export const buildDraftShapeText = (card: CanvasGenerationCard) => card.name.trim();

export function buildGenerationNodeCaption(
  card: CanvasGenerationCard,
  outputs: CanvasOutputCard[]
) {
  const label = buildDraftShapeText(card);
  const code = label.match(/^(S\d{2,})(?:\s*[·:：-]|\s|$)/i)?.[1] ?? '';
  const title = (code ? label.slice(code.length).replace(/^\s*[·:：-]\s*/, '') : label)
    .replace(/\s*·\s*t\d+.*$/i, '')
    .trim();
  const takes = buildGenerationTakes({ outputs, pinnedOutputId: card.pinnedOutputId });
  const take = takes.find((item) => item.isPinned);
  const selected = outputs.find((item) => item.id === take?.id);
  const durationSec = selected?.durationSec;
  const configured = selected?.generationSnapshot.duration ?? card.duration;
  const durationLabel = durationSec && durationSec > 0
    ? `${durationSec}s`
    : /^\d+(?:\.\d+)?s$/.test(configured) ? configured : '';
  return {
    label,
    shotCode: code,
    displayTitle: title,
    takeNumber: take?.takeNumber,
    durationLabel,
    hasCandidate: selected?.status === 'succeeded' && Boolean(selected.url || selected.resultText),
  };
}

export type CanvasShotOutlineEntry = ReturnType<typeof buildGenerationNodeCaption> & { id: string };
export function buildCanvasShotOutline(
  cards: Record<string, CanvasCard | undefined>
): CanvasShotOutlineEntry[] {
  const all = Object.values(cards);
  return all
    .filter((card): card is CanvasGenerationCard =>
      card?.kind === 'generation' && card.type === 'video' && card.generationMode !== 'analysis'
    )
    .map((card) => ({
      id: card.id,
      ...buildGenerationNodeCaption(card, all.filter((output): output is CanvasOutputCard =>
        output?.kind === 'output' && output.sourceConfigCardId === card.id
      )),
    }))
    .sort((a, b) =>
      a.shotCode.localeCompare(b.shotCode, undefined, { numeric: true }) || a.label.localeCompare(b.label)
    );
}
