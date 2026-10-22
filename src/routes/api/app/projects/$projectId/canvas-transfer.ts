import { createFileRoute } from '@tanstack/react-router';
import {
  applyCanvasTransfer,
  previewCanvasTransfer,
} from '@/core/series/canvas-transfer';
import { readSeriesMutation, seriesResponse } from '@/core/series/http';
import { z } from 'zod';
export const Route = createFileRoute(
  '/api/app/projects/$projectId/canvas-transfer',
)({
  server: {
    handlers: {
      POST: ({ params, request }) =>
        seriesResponse(async () => {
          const input = await readSeriesMutation(request);
          if (input.action === 'preview') {
            const { request: transfer } = z
              .object({
                action: z.literal('preview'),
                request: z.record(z.string(), z.unknown()),
              })
              .strict()
              .parse(input);
            const preview = await previewCanvasTransfer({
              ...transfer,
              projectId: params.projectId,
            } as Parameters<typeof previewCanvasTransfer>[0]);
            const { documents, observed, ...publicPreview } = preview;
            return publicPreview;
          }
          const { action, ...command } = input;
          return applyCanvasTransfer({
            ...(command as unknown as Parameters<
              typeof applyCanvasTransfer
            >[0]),
            projectId: params.projectId,
            origin: 'ui',
          });
        }),
    },
  },
});
