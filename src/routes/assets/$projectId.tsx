import { createFileRoute } from '@tanstack/react-router';

import { WorkspaceProjectRoutePage } from '@/components/app/workspace-project-route-page';
import { loadWorkspaceProjectRoute } from '@/core/projects/workspace-project-route-loader';

export const Route = createFileRoute('/assets/$projectId')({
  ssr: 'data-only',
  validateSearch: (search: Record<string, unknown>) => Object.fromEntries(['sceneId', 'canvasId', 'scope', 'q', 'mediaType', 'elementKind', 'usage', 'folderId', 'includeArchived'].map(key => [key, typeof search[key] === 'string' || typeof search[key] === 'number' || typeof search[key] === 'boolean' ? String(search[key]) : undefined])) as Record<string, string | undefined>,
  loaderDeps: ({ search }) => ({ search: { sceneId: search.sceneId, canvasId: search.canvasId } }),
  loader: ({ params, deps }) =>
    loadWorkspaceProjectRoute({
      projectId: params.projectId,
      search: deps.search,
      workspaceMode: 'assets',
    }),
  component: AssetsProjectRouteComponent,
});

function AssetsProjectRouteComponent() {
  return <WorkspaceProjectRoutePage data={Route.useLoaderData()} />;
}
