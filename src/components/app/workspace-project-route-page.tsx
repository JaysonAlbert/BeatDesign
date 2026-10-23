import { ProjectBrief } from './project-brief';
import { SeriesNavigation } from './series-navigation';
import { ProductPageShell } from '@/components/app/product-page-shell';
import { ProjectAssetsWorkspace } from '@/components/app/project-assets-workspace';
import { BeatStudioWorkspace } from '@/components/studio/beat-studio-workspace';
import { BeatCanvasShell } from '@/components/beatcanvas/beatcanvas-shell';
import { VideoEditorWorkspace } from '@/components/editor/video-editor-workspace';
import type { loadWorkspaceProjectRoute } from '@/core/projects/workspace-project-route-loader';
import { WorkspaceScopeProvider } from './workspace-scope';
import { useTranslations } from '@/core/workspace-lib/shims/next-intl';
import { Link } from '@/core/i18n/navigation';

type WorkspaceProjectRouteData = Awaited<
  ReturnType<typeof loadWorkspaceProjectRoute>
>;

export function WorkspaceProjectRoutePage({
  data,
}: {
  data: WorkspaceProjectRouteData;
}) {
  const t = useTranslations('Series');
  return (
    <WorkspaceScopeProvider
      value={{
        projectId: data.project.id,
        canvasId: data.canvasId,
        sceneId: data.sceneId,
        narrative: data.narrative,
      }}
    >
      <ProductPageShell
        workspaceName={data.project.name}
        projectId={data.project.id}
        workspaceMode={data.workspaceMode}
      >
        {data.scopeError ? (
          <div role="alert" className="m-8 space-y-4">
            <p>{t('scopeUnavailable')}</p>
            <Link href={`/canvas/${data.project.id}`}>
              {t('projectCanvas')}
            </Link>
          </div>
        ) : data.workspaceMode === 'canvas' && !data.canvasId ? (
          <div className="m-8">
            <p>{t('emptyScene')}</p>
            <p>{t('openNavigation')}</p>
          </div>
        ) : data.workspaceMode === 'studio' && data.panel === 'brief' ? (
          <ProjectBrief key={data.project.id} projectId={data.project.id} />
        ) : data.workspaceMode === 'studio' && data.panel === 'scenes' ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SeriesNavigation embedded />
          </div>
        ) : data.workspaceMode === 'studio' ? (
          <BeatStudioWorkspace
            key={data.project.id}
            projectId={data.project.id}
            initialTarget={data.target}
            initialModelId={data.modelId}
            initialPrompt={data.prompt}
          />
        ) : data.workspaceMode === 'assets' ? (
          <ProjectAssetsWorkspace
            key={data.project.id}
            projectId={data.project.id}
          />
        ) : data.workspaceMode === 'editor' ? (
          <VideoEditorWorkspace
            key={data.project.id}
            projectId={data.project.id}
            projectName={data.project.name}
            initialFocusClipId={data.focusClipId}
          />
        ) : (
          <BeatCanvasShell
            key={`${data.project.id}:${data.canvasId}`}
            projectId={data.project.id}
            canvasId={data.canvasId ?? undefined}
            projectPath={data.projectPath}
            initialProjectSnapshot={data.snapshot}
            initialProjectSnapshotVersion={data.snapshotVersion}
            initialTarget={data.target}
            initialModelId={data.modelId}
            initialPrompt={data.prompt}
            initialFocusCardId={data.focusCardId}
          />
        )}
      </ProductPageShell>
    </WorkspaceScopeProvider>
  );
}
