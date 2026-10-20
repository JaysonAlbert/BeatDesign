import { createFileRoute } from '@tanstack/react-router';
import {
  applySharedCommand,
  getSharedLibrary,
} from '@/core/series/shared-assets';
import { readSeriesMutation, seriesResponse } from '@/core/series/http';
export const Route = createFileRoute('/api/app/series/$seriesId/shared')({
  server: {
    handlers: {
      GET: ({ params }) =>
        seriesResponse(() => getSharedLibrary(params.seriesId)),
      POST: ({ params, request }) =>
        seriesResponse(async () =>
          applySharedCommand({
            ...((await readSeriesMutation(request)) as unknown as Parameters<
              typeof applySharedCommand
            >[0]),
            seriesId: params.seriesId,
            origin: 'ui',
          }),
        ),
    },
  },
});
