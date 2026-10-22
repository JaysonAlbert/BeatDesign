import { createFileRoute } from '@tanstack/react-router';
import { getNarrative, applyNarrativeCommand } from '@/core/series/narrative';
import { seriesResponse, readSeriesMutation } from '@/core/series/http';
export const Route = createFileRoute('/api/app/projects/$projectId/narrative')({
  server: {
    handlers: {
      GET: ({ params }) => seriesResponse(() => getNarrative(params.projectId)),
      POST: ({ params, request }) =>
        seriesResponse(async () =>
          applyNarrativeCommand({
            ...((await readSeriesMutation(request)) as unknown as Parameters<
              typeof applyNarrativeCommand
            >[0]),
            projectId: params.projectId,
            origin: 'ui',
          }),
        ),
    },
  },
});
