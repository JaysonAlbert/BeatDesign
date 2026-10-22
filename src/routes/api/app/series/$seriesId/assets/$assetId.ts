import { createFileRoute } from '@tanstack/react-router';
import { getSeriesAsset } from '@/core/series/shared-assets';
import { serveLocalAsset } from '@/core/projects/serve-local-asset';
export const Route = createFileRoute(
  '/api/app/series/$seriesId/assets/$assetId',
)({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        try {
          const asset = await getSeriesAsset(params.seriesId, params.assetId);
          if (asset.storageProvider !== 'local')
            return Response.json(
              { error: 'Local media not found.' },
              { status: 404 },
            );
          return serveLocalAsset(request, asset);
        } catch {
          return Response.json(
            { error: 'Shared media not found.' },
            { status: 404 },
          );
        }
      },
    },
  },
});
