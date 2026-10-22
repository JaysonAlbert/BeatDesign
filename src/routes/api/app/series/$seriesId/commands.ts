import { createFileRoute } from '@tanstack/react-router';
import {
  applySeriesCommand,
  type SeriesCommandInput,
} from '@/core/series/service';
import { seriesResponse, readSeriesMutation } from '@/core/series/http';
export const Route = createFileRoute('/api/app/series/$seriesId/commands')({
  server: {
    handlers: {
      POST: ({ params, request }) =>
        seriesResponse(async () =>
          applySeriesCommand({
            ...((await readSeriesMutation(
              request,
            )) as unknown as SeriesCommandInput),
            seriesId: params.seriesId,
            origin: 'ui',
          }),
        ),
    },
  },
});
