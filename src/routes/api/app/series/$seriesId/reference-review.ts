import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import {
  applyReferenceReview,
  previewReferenceReview,
} from '@/core/series/reference-review';
import { readSeriesMutation, seriesResponse } from '@/core/series/http';
export const Route = createFileRoute(
  '/api/app/series/$seriesId/reference-review',
)({
  server: {
    handlers: {
      POST: ({ params, request }) =>
        seriesResponse(async () => {
          const input = await readSeriesMutation(request);
          if (input.action === 'preview') {
            const { request: review } = z
              .object({
                action: z.literal('preview'),
                request: z.record(z.string(), z.unknown()),
              })
              .strict()
              .parse(input);
            const preview = await previewReferenceReview({
              ...review,
              seriesId: params.seriesId,
            } as Parameters<typeof previewReferenceReview>[0]);
            const { observed, groups, organizations, ...publicPreview } =
              preview;
            return publicPreview;
          }
          const { action, ...command } = input;
          return applyReferenceReview({
            ...(command as unknown as Parameters<
              typeof applyReferenceReview
            >[0]),
            seriesId: params.seriesId,
            origin: 'ui',
          });
        }),
    },
  },
});
