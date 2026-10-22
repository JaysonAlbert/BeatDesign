import { createFileRoute } from '@tanstack/react-router';
import { loadProjectRevision } from '@/core/projects/project-revision';

export const Route = createFileRoute('/api/app/projects/$projectId/revision')({
  server: { handlers: { GET: async ({ params, request }) => {
    const revision = await loadProjectRevision(params.projectId, new URL(request.url).searchParams.get('canvasId'));
    return revision
      ? Response.json(revision, { headers: { 'cache-control': 'no-store' } })
      : Response.json({ error: 'Project not found' }, { status: 404 });
  } } },
});
