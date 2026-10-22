import { createFileRoute } from '@tanstack/react-router';

import { WorkspaceProjectRoutePage } from '@/components/app/workspace-project-route-page';
import { loadWorkspaceProjectRoute } from '@/core/projects/workspace-project-route-loader';

export const Route = createFileRoute('/studio/$projectId')({
  ssr: 'data-only',
  validateSearch: (search: Record<string, unknown>) => ({
    sceneId: typeof search.sceneId === 'string' ? search.sceneId : undefined,
    canvasId: typeof search.canvasId === 'string' ? search.canvasId : undefined,
    target: (search.target as string) || undefined,
    model: (search.model as string) || undefined,
    prompt: (search.prompt as string) || undefined,
  }),
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ params, deps }) =>
    loadWorkspaceProjectRoute({
      projectId: params.projectId,
      search: deps.search,
      workspaceMode: 'studio',
    }),
  component: StudioProjectRouteComponent,
});

function StudioProjectRouteComponent() {
  return <WorkspaceProjectRoutePage data={Route.useLoaderData()} />;
}
