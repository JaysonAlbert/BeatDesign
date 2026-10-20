import { createFileRoute } from '@tanstack/react-router';
import { getScopedAssetDetails } from '@/core/series/asset-details';
import { seriesResponse } from '@/core/series/http';
export const Route = createFileRoute(
  '/api/app/projects/$projectId/asset-details/$assetId',
)({
  server: {
    handlers: {
      GET: ({ params, request }) =>
        seriesResponse(() => {
          const query = new URL(request.url).searchParams;
          return getScopedAssetDetails(
            params.projectId,
            params.assetId,
            query.get('seriesId') ?? undefined,
            Number(query.get('historyOffset') ?? 0),
          );
        }),
    },
  },
});
