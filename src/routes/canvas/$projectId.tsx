import { createFileRoute } from '@tanstack/react-router';

import { WorkspaceProjectRoutePage } from '@/components/app/workspace-project-route-page';
import { loadWorkspaceProjectRoute } from '@/core/projects/workspace-project-route-loader';

export const Route = createFileRoute('/canvas/$projectId')({
  ssr: 'data-only',
  validateSearch: (search: Record<string, unknown>) => ({
    sceneId: typeof search.sceneId === 'string' ? search.sceneId : undefined,
    canvasId: typeof search.canvasId === 'string' ? search.canvasId : undefined,
    target: (search.target as string) || undefined,
    model: (search.model as string) || undefined,
    prompt: (search.prompt as string) || undefined,
    preview: (search.preview as string) || undefined,
    focus: (search.focus as string) || undefined,
  }),
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ params, deps }) =>
    loadWorkspaceProjectRoute({
      projectId: params.projectId,
      search: deps.search,
      workspaceMode: 'canvas',
    }),
  component: CanvasProjectRouteComponent,
});

function CanvasProjectRouteComponent() {
  return <WorkspaceProjectRoutePage data={Route.useLoaderData()} />;
}
