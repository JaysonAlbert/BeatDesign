import { useState } from 'react';
import {
  useWorkspaceScope,
  useScopeNavigation,
} from '@/components/app/workspace-scope';
import { useTranslations } from '@/core/workspace-lib/shims/next-intl';
import { apiJsonGet, apiJsonPost } from '@/lib/api-client';
import type { ProjectSnapshotDocument } from '@/core/projects/project-snapshot';
import type { previewCanvasTransfer } from '@/core/series/canvas-transfer';
import { defaultCanvasId } from '@/core/projects/canvas-identity';
import { toast } from 'sonner';
type Preview = Omit<
  Awaited<ReturnType<typeof previewCanvasTransfer>>,
  'observed' | 'documents'
>;
const control =
  'min-h-11 rounded-lg border border-white/15 bg-white/5 px-3 text-sm focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-40';
export function CanvasTransferPanel(props: {
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
  const [target, setTarget] = useState('');
  const [includeDependencies, setIncludeDependencies] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const currentId = props.canvasId ?? defaultCanvasId(props.projectId);
  const targets =
    scope?.narrative.canvases.filter(
      (c) =>
        c.id !== currentId &&
        !c.archivedAt &&
        (!c.sceneId ||
          scope.narrative.scenes.some(
            (s) => s.id === c.sceneId && !s.archivedAt,
          )),
    ) ?? [];
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }
  if (!targets.length) return null;
  return (
    <section className="space-y-2 border-t border-white/10 pt-3">
      <h3 className="text-sm font-semibold">{t('transferToScene')}</h3>
      <select
        className={`${control} w-full`}
        value={target}
        aria-label={t('targetCanvas')}
        onChange={(e) => {
          setTarget(e.target.value);
          setPreview(null);
        }}
      >
        <option value="">{t('targetCanvas')}</option>
        {targets.map((c) => (
          <option key={c.id} value={c.id}>
            {scope?.narrative.scenes.find((s) => s.id === c.sceneId)?.name ||
              t('unassigned')}{' '}
            / {c.name}
          </option>
        ))}
      </select>
      <label className="flex min-h-11 items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={includeDependencies}
          onChange={(e) => {
            setIncludeDependencies(e.target.checked);
            setPreview(null);
          }}
        />
        {t('includeDependencies')}
      </label>
      <button
        className={control}
        disabled={busy || !target || !props.selectedCardIds.length}
        onClick={() =>
          void run(async () => {
            await props.flush();
            setPreview(
              await apiJsonPost<Preview>(
                `/api/app/projects/${props.projectId}/canvas-transfer`,
                {
                  action: 'preview',
                  request: {
                    projectId: props.projectId,
                    sourceCanvasId: currentId,
                    targetCanvasId: target,
                    selectedCardIds: props.selectedCardIds,
                    includeDependencies,
                  },
                },
              ),
            );
          })
        }
      >
        {t('previewTransfer')}
      </button>
      {preview && (
        <div className="space-y-2 rounded-lg border border-orange-500/40 p-3">
          <p>{t('transferCount', { count: preview.cardIds.length })}</p>
          <ul className="max-h-40 overflow-y-auto text-xs">
            {preview.cardIds.map((id) => (
              <li key={id}>
                {props.getDocument().cards.find((c) => c.id === id)?.name || id}
                {preview.additionalCardIds.includes(id)
                  ? ` · ${t('dependency')}`
                  : ''}
              </li>
            ))}
          </ul>
          {preview.blockers.map((message) => (
            <p role="alert" className="text-xs" key={message}>
              {message}
            </p>
          ))}
          <button
            className={control}
            disabled={busy || Boolean(preview.blockers.length)}
            onClick={() =>
              void run(async () => {
                await props.flush();
                const commandId = crypto.randomUUID();
                await apiJsonPost(
                  `/api/app/projects/${props.projectId}/canvas-transfer`,
                  {
                    action: 'apply',
                    commandId,
                    idempotencyKey: commandId,
                    expectedRevision: preview.sourceRevision,
                    previewToken: preview.previewToken,
                  },
                );
                const source = await apiJsonGet<{
                  document: ProjectSnapshotDocument;
                  version: number;
                }>(
                  `/api/app/projects/${props.projectId}/snapshot?canvasId=${encodeURIComponent(currentId)}`,
                );
                props.acceptSnapshot(source.document, source.version);
                setPreview(null);
              })
            }
          >
            {t('confirmTransfer')}
          </button>
          <button
            className={control}
            onClick={() =>
              void navigate(
                `/canvas/${props.projectId}?canvasId=${encodeURIComponent(target)}`,
              )
            }
          >
            {t('openTarget')}
          </button>
        </div>
      )}
    </section>
  );
}
