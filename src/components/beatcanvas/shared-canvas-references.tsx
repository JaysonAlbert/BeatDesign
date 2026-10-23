import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  useWorkspaceScope,
  useScopeNavigation,
  scopeSearch,
} from '@/components/app/workspace-scope';
import { useTranslations } from '@/core/workspace-lib/shims/next-intl';
import { apiJsonGet } from '@/lib/api-client';
import { executeProjectCommand } from '@/core/commands/client';
import type { getSharedLibrary } from '@/core/series/shared-assets';
import type { ProjectSnapshotDocument } from '@/core/projects/project-snapshot';
import { toast } from 'sonner';
const control =
  'min-h-11 rounded-lg border border-white/15 bg-white/5 px-3 text-sm focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-40';
export function SharedCanvasReferences(props: {
  projectId: string;
  canvasId?: string;
  selectedCardIds: string[];
  getDocument: () => ProjectSnapshotDocument;
  flush: () => Promise<void>;
  acceptSnapshot: (document: ProjectSnapshotDocument, revision: number) => void;
}) {
  const scope = useWorkspaceScope();
  const navigate = useScopeNavigation();
  const t = useTranslations('Series');
  const seriesId = scope?.narrative.episode?.seriesId;
  const [elementId, setElementId] = useState('');
  const [versionId, setVersionId] = useState('');
  const [slotKey, setSlotKey] = useState('');
  const [busy, setBusy] = useState(false);
  const library = useQuery({
    queryKey: ['shared-elements', seriesId],
    queryFn: () =>
      apiJsonGet<Awaited<ReturnType<typeof getSharedLibrary>>>(
        `/api/app/series/${seriesId}/shared`
      ),
    enabled: Boolean(seriesId),
    refetchInterval: 5000,
  });
  if (!seriesId)
    return (
      <p className="py-3 text-sm text-white/50">{t('noSeriesReferences')}</p>
    );
  const document = props.getDocument();
  const element = library.data?.elements.find((e) => e.id === elementId);
  const version = element?.versions.find((v) => v.id === versionId);
  const consumer = document.cards.filter(
    (c) => props.selectedCardIds.includes(c.id) && c.kind === 'generation'
  );
  const slots = Object.values(
    document.organization?.templateInstances ?? {}
  ).flatMap((instance) =>
    instance.slotDefinitions.map((slot) => ({
      value: JSON.stringify([instance.id, slot.id]),
      label: slot.label,
    }))
  );
  async function bind() {
    if (!version || !element) return;
    setBusy(true);
    try {
      await props.flush();
      const state = await apiJsonGet<{ version: number }>(
        `/api/app/projects/${props.projectId}/snapshot${props.canvasId ? `?canvasId=${encodeURIComponent(props.canvasId)}` : ''}`
      );
      const binding = {
        scope: 'series' as const,
        ownerId: seriesId!,
        elementId: element.id,
        versionId: version.id,
        assetId: version.assetId,
        referenceCardId: crypto.randomUUID(),
      };
      const result = await executeProjectCommand({
        projectId: props.projectId,
        canvasId: props.canvasId,
        expectedRevision: state.version,
        command: {
          type: 'canvas.apply',
          operations: [
            slotKey
              ? {
                  type: 'bind_template_slot',
                  instanceId: JSON.parse(slotKey)[0],
                  slotId: JSON.parse(slotKey)[1],
                  binding,
                }
              : {
                  type: 'bind_element',
                  ...binding,
                  bindingId: crypto.randomUUID(),
                  consumerCardId: consumer[0].id,
                  order: consumer[0].referenceCardIds.length,
                  role: element.kind === 'voice' ? 'audio_track' : 'reference',
                },
          ],
        },
      });
      if (!result.ok) throw new Error(result.message);
      if (result.data.canvas)
        props.acceptSnapshot(result.data.canvas, result.revision!);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="space-y-2 border-t border-white/10 pt-3"
      aria-label={t('sharedElements')}
    >
      <h3 className="text-sm font-semibold">{t('sharedElements')}</h3>
      <p className="text-xs text-white/50">{t('selectStep')}</p>
      <select
        className={`${control} w-full`}
        value={elementId}
        aria-label={t('chooseSharedElement')}
        onChange={(e) => {
          const item = library.data?.elements.find(
            (x) => x.id === e.target.value
          );
          setElementId(e.target.value);
          setVersionId(item?.currentVersionId ?? '');
        }}
      >
        <option value="">{t('chooseSharedElement')}</option>
        {library.data?.elements
          .filter((e) => !e.archivedAt)
          .map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
      </select>
      <select
        className={`${control} w-full`}
        value={versionId}
        aria-label={t('fixedVersion')}
        onChange={(e) => setVersionId(e.target.value)}
      >
        <option value="">{t('fixedVersion')}</option>
        {element?.versions.map((v) => (
          <option key={v.id} value={v.id}>
            v{v.ordinal}
          </option>
        ))}
      </select>
      {version?.url &&
        (version.mediaType === 'audio' ? (
          <audio src={version.url} controls className="w-full" />
        ) : (
          <img
            src={version.url}
            alt={element!.name}
            loading="lazy"
            className="max-h-36 w-full rounded-md object-contain"
          />
        ))}
      {slots.length > 0 && (
        <select
          className={`${control} w-full`}
          value={slotKey}
          onChange={(e) => setSlotKey(e.target.value)}
          aria-label={t('templateSlot')}
        >
          <option value="">{t('selectedStep')}</option>
          {slots.map((slot) => (
            <option key={slot.value} value={slot.value}>
              {slot.label}
            </option>
          ))}
        </select>
      )}
      <button
        className={control}
        disabled={
          busy ||
          !version ||
          (!slotKey && consumer.length !== 1) ||
          Boolean(library.data?.archivedAt)
        }
        onClick={() => void bind()}
      >
        {t('bindFixedVersion')}
      </button>
      {Object.values(document.organization?.elementBindings ?? {})
        .filter(
          (b) =>
            b.scope === 'series' &&
            props.selectedCardIds.includes(b.consumerCardId)
        )
        .map((binding) => {
          const identity = library.data?.elements.find(
            (e) => e.id === binding.elementId
          );
          const version = identity?.versions.find(
            (v) => v.id === binding.versionId
          );
          return (
            <div
              key={binding.id}
              className="rounded-md border border-white/10 p-2 text-xs"
            >
              <p>
                {identity?.name ?? binding.elementId} · v
                {version?.ordinal ?? binding.versionId}
              </p>
              <p className="truncate">
                {document.cards.find((c) => c.id === binding.consumerCardId)
                  ?.name ?? binding.consumerCardId}
              </p>
              {identity &&
                identity.currentVersionId !==
                  binding.reviewedAgainstCurrentVersionId && (
                  <p className="mt-1 text-orange-300">
                    {t('newVersionAvailable')}
                  </p>
                )}
            </div>
          );
        })}
      <button
        className={control}
        onClick={() =>
          void navigate(
            `/assets/${props.projectId}${scopeSearch({ sceneId: scope?.sceneId, canvasId: props.canvasId })}${scope?.sceneId || props.canvasId ? '&' : '?'}scope=series`
          )
        }
      >
        {t('reviewInAssets')}
      </button>
    </section>
  );
}
