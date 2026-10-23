import { useEffect, useRef, useState } from 'react';
import { FileText, Save } from 'lucide-react';
import { useTranslations } from '@/core/workspace-lib/shims/next-intl';
import { useProjectOrganization } from './use-project-organization';

export function ProjectBrief({ projectId }: { projectId: string }) {
  const t = useTranslations('Production');
  const state = useProjectOrganization(projectId);
  const [draft, setDraft] = useState('');
  const baseline = useRef<{ text: string; revision: number } | null>(null);
  const [saved, setSaved] = useState(false);
  const [, review] = useState(0);
  useEffect(() => {
    if (!state.data) return;
    const text = state.data.document.brief ?? '';
    if (!baseline.current || draft === baseline.current.text) {
      baseline.current = { text, revision: state.data.revision };
      setDraft(text);
    }
  }, [state.data, draft]);
  const dirty = Boolean(baseline.current && draft !== baseline.current.text);
  const conflict = Boolean(
    dirty &&
    state.data &&
    baseline.current &&
    state.data.revision !== baseline.current.revision
  );
  async function save() {
    if (!baseline.current || !dirty) return;
    await state.apply(
      [{ type: 'set_brief', text: draft }],
      baseline.current.revision
    );
    baseline.current = null;
    setSaved(true);
    await state.refetch();
  }
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const beforeScope = (event: Event) => {
      const detail = (
        event as CustomEvent<{ waitUntil: (promise: Promise<void>) => void }>
      ).detail;
      if (dirty) detail.waitUntil(saveRef.current());
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beatdesign:before-scope-change', beforeScope);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('beatdesign:before-scope-change', beforeScope);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [dirty]);
  return (
    <section
      className="min-h-0 flex-1 overflow-y-auto bg-[#111214] px-6 py-8 sm:px-12"
      aria-label={t('brief')}
    >
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <h1 className="flex items-center gap-3 text-2xl font-semibold">
            <FileText size={23} />
            {t('brief')}
          </h1>
          <button
            className="flex h-9 items-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-black disabled:opacity-40"
            disabled={!dirty || state.busy || conflict}
            onClick={() => void save().catch(() => undefined)}
          >
            <Save size={15} />
            {t(state.busy ? 'saving' : 'save')}
          </button>
        </div>
        <p className="mb-6 max-w-2xl text-sm leading-6 text-white/45">
          {t('briefHint')}
        </p>
        {(state.error || state.writeError) && (
          <p role="alert" className="mb-4 text-sm text-red-300">
            {state.writeError || String(state.error)}
          </p>
        )}
        {conflict && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-orange-400/30 p-3 text-sm"
          >
            {t('briefConflict')}{' '}
            <pre className="my-3 max-h-44 overflow-auto whitespace-pre-wrap rounded bg-black/20 p-3 text-xs">
              {state.data?.document.brief}
            </pre>
            <button
              className="ml-2 underline"
              onClick={() => {
                if (state.data)
                  baseline.current = {
                    text: baseline.current!.text,
                    revision: state.data.revision,
                  };
                setSaved(false);
                review((v) => v + 1);
              }}
            >
              {t('keepDraft')}
            </button>
          </div>
        )}
        {!state.data ? (
          <p role="status">{t('loading')}</p>
        ) : (
          <textarea
            aria-label={t('briefContent')}
            disabled={state.busy || state.pending}
            maxLength={30000}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setSaved(false);
            }}
            placeholder={t('briefTemplate')}
            className="min-h-[60vh] w-full resize-y border-0 bg-transparent text-base leading-8 text-white/85 outline-none placeholder:text-white/30"
          />
        )}
        <div className="mt-4 flex justify-between text-xs text-white/35">
          <span role="status">
            {dirty ? t('unsaved') : saved ? t('saved') : ''}
          </span>
          <span>{draft.length.toLocaleString()} / 30,000</span>
        </div>
      </div>
    </section>
  );
}
