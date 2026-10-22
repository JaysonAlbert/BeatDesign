import { createFileRoute } from '@tanstack/react-router';
import { previewSharedArchive } from '@/core/series/shared-assets';
import { readSeriesMutation, seriesResponse } from '@/core/series/http';
export const Route = createFileRoute(
  '/api/app/series/$seriesId/archive-preview',
)({
  server: {
    handlers: {
      POST: ({ params, request }) =>
        seriesResponse(async () => {
          const { observed, ...preview } = await previewSharedArchive({
            ...((await readSeriesMutation(request)) as Parameters<
              typeof previewSharedArchive
            >[0]),
            seriesId: params.seriesId,
          });
          return preview;
        }),
    },
  },
});
