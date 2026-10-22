import { createFileRoute } from '@tanstack/react-router';

import { WorkspaceProjectRoutePage } from '@/components/app/workspace-project-route-page';
import { loadWorkspaceProjectRoute } from '@/core/projects/workspace-project-route-loader';

export const Route = createFileRoute('/editor/$projectId')({
  ssr: 'data-only',
  validateSearch: (search: Record<string, unknown>) => ({ clipId: typeof search.clipId === 'string' ? search.clipId : undefined, t: typeof search.t === 'string' ? search.t : undefined, sceneId: typeof search.sceneId === 'string' ? search.sceneId : undefined, canvasId: typeof search.canvasId === 'string' ? search.canvasId : undefined }),
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ params, deps }) =>
    loadWorkspaceProjectRoute({
      projectId: params.projectId,
      search: deps.search,
      workspaceMode: 'editor',
    }),
  component: EditorProjectRouteComponent,
});

function EditorProjectRouteComponent() {
  return <WorkspaceProjectRoutePage data={Route.useLoaderData()} />;
}
