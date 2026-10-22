import { createFileRoute } from '@tanstack/react-router';
import { queryScopedAssets } from '@/core/series/asset-query';
import { seriesResponse } from '@/core/series/http';
export const Route = createFileRoute(
  '/api/app/projects/$projectId/scoped-assets',
)({
  server: {
    handlers: {
      GET: ({ params, request }) =>
        seriesResponse(() => {
          const values = Object.fromEntries(new URL(request.url).searchParams);
          return queryScopedAssets({
            ...values,
            includeArchived: values.includeArchived === 'true',
            ...(values.folderId === '@unassigned' ? { folderId: null } : {}),
            projectId: params.projectId,
            scope: values.scope as 'scene' | 'episode' | 'series',
            limit: values.limit ? Number(values.limit) : undefined,
          });
        }),
    },
  },
});
