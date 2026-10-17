import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { generateEffect, getEffectStatus, precheckEffect } from '@/core/effects/client-api';
import { resolveOutputMedia } from '@/core/effects/output-media';
import { getActiveGenerationProviderId } from '@/core/generation-providers/registry';
import { useTranslations } from '@/core/workspace-lib/shims/next-intl';

export function LocalTtsComposer({ projectId }: { projectId: string }) {
  const t = useTranslations('LocalRuntime');
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [task, setTask] = useState('');
  const [status, setStatus] = useState('');
  const [audio, setAudio] = useState('');
  useEffect(() => { setTask(localStorage.getItem(`local-tts:${projectId}`) || ''); }, [projectId]);
  useEffect(() => {
    if (!task) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await getEffectStatus({ wmTaskId: task });
        if (stopped) return;
        if (!result.ok) throw new Error(result.data.error || t('failed'));
        setStatus(result.data.error || t(result.data.status || 'pending'));
        if (result.data.status === 'succeeded' || result.data.status === 'failed') {
          setAudio(resolveOutputMedia(result.data.output).resultUrl || '');
          setBusy(false);
          await queryClient.invalidateQueries();
          return;
        }
        setBusy(true);
      } catch (error) { if (!stopped) setStatus(String(error)); }
      if (!stopped) timer = setTimeout(poll, 4000);
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [task, queryClient]);
  if (getActiveGenerationProviderId() !== 'workstation') return null;
  const submit = async () => {
    setBusy(true); setAudio(''); setStatus(t('pending'));
    try {
      const generation = { version: 2, projectId, mode: 'audio', modelId: 'local-drama3', prompt: text, references: [], parameters: {} };
      const preflight = await precheckEffect({ generation });
      if (!preflight.ok) throw new Error(preflight.data.error);
      const result = await generateEffect({ generation, generationIntentToken: preflight.data.uploadIntentToken });
      if (!result.ok || !result.data.wmTaskId) throw new Error(result.data.error || t('failed'));
      localStorage.setItem(`local-tts:${projectId}`, result.data.wmTaskId);
      setTask(result.data.wmTaskId);
    } catch (error) { setStatus(String(error)); setBusy(false); }
  };
  return <div className="mt-6 space-y-3 rounded-xl border border-[var(--beat-border)] bg-[var(--beat-bg-elevated)] p-4">
    <h2 className="text-sm font-semibold">{t('title')}</h2>
    <p className="text-xs text-[var(--beat-text-3)]">{t('description')}</p>
    <Textarea aria-label={t('text')} value={text} maxLength={200} onChange={e => setText(e.target.value)} placeholder={t('text')} />
    <Button disabled={busy || !text.trim()} onClick={() => void submit()}>{t('generate')}</Button>
    <p className="text-xs" role="status">{status}</p>
    {audio && <audio controls src={audio} className="w-full" />}
  </div>;
}
