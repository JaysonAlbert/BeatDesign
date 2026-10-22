import { createFileRoute } from '@tanstack/react-router';
import { listSeries } from '@/core/series/service';
import { seriesResponse } from '@/core/series/http';
export const Route = createFileRoute('/api/app/series/')({
  server: {
    handlers: {
      GET: ({ request }) =>
        seriesResponse(() =>
          listSeries(
            new URL(request.url).searchParams.get('archived') === 'true',
          ),
        ),
    },
  },
});
