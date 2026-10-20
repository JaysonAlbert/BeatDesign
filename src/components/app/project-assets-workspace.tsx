import { LocalTtsComposer } from './local-tts-composer';
import { ProjectOrganizationWorkspace } from './project-organization-workspace';
import { ProjectAssetsLibrary } from '@/components/app/project-assets-dialog';
import { useTranslations } from '@/core/workspace-lib/shims/next-intl';
import { ScopedAssetsBoard } from './scoped-assets-board';
import { useState } from 'react';

export function ProjectAssetsWorkspace({ projectId }: { projectId: string }) {
  const t = useTranslations('AppShell.header.projectAssets');
  const seriesT = useTranslations('Series');
  const [managementOpen, setManagementOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);

  return (
    <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--beat-bg)] text-[var(--beat-text-1)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_112%,rgba(255,122,51,0.12),transparent_34%),linear-gradient(180deg,#08090a_0%,#0b0b0d_48%,#08090a_100%)]" />
      <div className="relative min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-6">
        <div className="mx-auto w-full max-w-[1138px]">
          <h1 className="beat-product-display text-[1.35rem] font-semibold tracking-[-0.03em] text-[var(--beat-text-1)]">
            {t('title')}
          </h1>
          <p className="mt-2 whitespace-nowrap text-[13px] leading-6 text-[var(--beat-text-3)]">
            {t('description')}
          </p>
          <LocalTtsComposer projectId={projectId} />
          <ScopedAssetsBoard projectId={projectId} />
          <details className="mt-8 border-t border-white/10 pt-3" open={managementOpen} onToggle={event => setManagementOpen(event.currentTarget.open)}><summary className="min-h-11 cursor-pointer py-3">{seriesT('manageProjectAssets')}</summary>{managementOpen && <ProjectOrganizationWorkspace key={projectId} projectId={projectId} />}</details>
          <details className="mt-5 border-t border-white/10 pt-3" open={toolsOpen} onToggle={event => setToolsOpen(event.currentTarget.open)}><summary className="min-h-11 cursor-pointer py-3">{seriesT('projectAssetTools')}</summary>{toolsOpen && <ProjectAssetsLibrary projectId={projectId} />}</details>
        </div>
      </div>
    </section>
  );
}
