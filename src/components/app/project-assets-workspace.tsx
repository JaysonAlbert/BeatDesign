import { useState } from 'react';
import { useSearch } from '@tanstack/react-router';
import { MoreHorizontal, Upload } from 'lucide-react';
import { LocalTtsComposer } from './local-tts-composer';
import { ProjectOrganizationWorkspace } from './project-organization-workspace';
import { ProjectAssetsLibrary } from './project-assets-dialog';
import { ProjectElementsGallery } from './project-elements-gallery';
import { useProjectOrganization } from './use-project-organization';
import { useWorkspaceScope } from './workspace-scope';
import { useTranslations } from '@/core/workspace-lib/shims/next-intl';
import { ScopedAssetsBoard } from './scoped-assets-board';
import { WorkspacePopover, workspaceRow } from './workspace-popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function ProjectAssetsWorkspace({ projectId }: { projectId: string }) {
  const t = useTranslations('Production');
  const seriesT = useTranslations('Series');
  const search = useSearch({ strict: false }) as Record<
    string,
    string | undefined
  >;
  const scope = useWorkspaceScope();
  const organization = useProjectOrganization(projectId);
  const [task, setTask] = useState<'organize' | 'import' | 'audio' | null>(
    null
  );
  if (search.view === 'elements')
    return <ProjectElementsGallery projectId={projectId} />;
  const title = search.folderId
    ? (organization.data?.document.folders[search.folderId]?.name ??
      t('allAssets'))
    : search.scope === 'scene'
      ? (scope?.narrative.scenes.find((s) => s.id === scope.sceneId)?.name ??
        t('allAssets'))
      : t('allAssets');
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#111214] px-5 py-6 text-[var(--beat-text-1)] sm:px-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="truncate text-xl font-semibold">{title}</h1>
        <div className="flex items-center gap-2">
          <button
            className="flex h-9 items-center gap-2 rounded-lg border border-white/15 px-3 text-sm"
            onClick={() => setTask('import')}
          >
            <Upload size={15} />
            {t('importAssets')}
          </button>
          <WorkspacePopover
            label={t('assetActions')}
            trigger={<MoreHorizontal size={18} />}
            align="end"
          >
            <button
              className={workspaceRow}
              onClick={() => setTask('organize')}
            >
              {seriesT('manageProjectAssets')}
            </button>
            <button className={workspaceRow} onClick={() => setTask('audio')}>
              {t('audioTools')}
            </button>
          </WorkspacePopover>
        </div>
      </div>
      <ScopedAssetsBoard projectId={projectId} />
      <Dialog
        open={task !== null}
        onOpenChange={(open) => {
          if (!open) setTask(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto border-white/10 bg-[#17181b] text-white sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {task === 'organize'
                ? seriesT('manageProjectAssets')
                : task === 'audio'
                  ? t('audioTools')
                  : t('importAssets')}
            </DialogTitle>
          </DialogHeader>
          {task === 'organize' ? (
            <ProjectOrganizationWorkspace projectId={projectId} />
          ) : task === 'audio' ? (
            <LocalTtsComposer projectId={projectId} />
          ) : task === 'import' ? (
            <ProjectAssetsLibrary projectId={projectId} />
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
