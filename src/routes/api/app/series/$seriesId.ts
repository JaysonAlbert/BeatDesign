import { createFileRoute } from '@tanstack/react-router';
import { getSeries } from '@/core/series/service';
import { seriesResponse } from '@/core/series/http';
import { ScopeError } from '@/core/series/contracts';
export const Route = createFileRoute('/api/app/series/$seriesId')({
  server: {
    handlers: {
      GET: ({ params }) =>
        seriesResponse(async () => {
          const state = await getSeries(params.seriesId);
          if (!state) throw new ScopeError('NOT_FOUND', 'Series not found.');
          return state;
        }),
    },
  },
});
