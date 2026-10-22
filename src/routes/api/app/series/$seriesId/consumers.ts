import { createFileRoute } from '@tanstack/react-router';
import { querySharedConsumers } from '@/core/series/shared-assets';
import { seriesResponse } from '@/core/series/http';
export const Route = createFileRoute('/api/app/series/$seriesId/consumers')({
  server: {
    handlers: {
      GET: ({ params, request }) =>
        seriesResponse(() => {
          const q = new URL(request.url).searchParams;
          return querySharedConsumers(
            params.seriesId,
            q.get('elementId') ?? '',
            q.get('cursor') ?? undefined,
          );
        }),
    },
  },
});
