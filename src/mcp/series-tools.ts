import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
  applySeriesCommand,
  getSeries,
  listSeries,
} from '@/core/series/service';
import { applyNarrativeCommand, getNarrative } from '@/core/series/narrative';
import {
  applySharedCommand,
  getSharedLibrary,
  querySharedConsumers,
  previewSharedArchive,
} from '@/core/series/shared-assets';
import {
  applyReferenceReview,
  previewReferenceReview,
} from '@/core/series/reference-review';
import {
  applyCanvasTransfer,
  previewCanvasTransfer,
} from '@/core/series/canvas-transfer';
import { getScopedAssetDetails } from '@/core/series/asset-details';

type Wrapper = <A, R>(
  handler: (args: A) => R | Promise<R>,
) => (args: A) => Promise<{
  content: { type: 'text'; text: string }[];
  structuredContent: Record<string, unknown>;
  isError?: boolean;
}>;
const id = z.string().min(1).max(200);
const envelope = {
  commandId: id,
  idempotencyKey: id,
  expectedRevision: z.number().int().nonnegative(),
  command: z.record(z.string(), z.unknown()),
};
export function registerSeriesTools(
  server: McpServer,
  { withToolErrors }: { withToolErrors: Wrapper },
) {
  server.registerTool(
    'bdesign_series_list',
    {
      description:
        'List local Series collections. Does not load episode Canvas documents.',
      inputSchema: z
        .object({ includeArchived: z.boolean().default(false) })
        .strict(),
      annotations: { readOnlyHint: true },
    },
    withToolErrors(async ({ includeArchived }) => ({
      series: await listSeries(includeArchived),
    })),
  );
  server.registerTool(
    'bdesign_series_get',
    {
      description: 'Read a Series and ordered episode Projects.',
      inputSchema: z.object({ seriesId: id }).strict(),
      annotations: { readOnlyHint: true },
    },
    withToolErrors(async ({ seriesId }) => {
      const state = await getSeries(seriesId);
      if (!state) throw new Error('Series not found.');
      return state;
    }),
  );
  server.registerTool(
    'bdesign_series_apply',
    {
      description:
        'Create/update/archive a local Series or attach/order episodes. Requires a stable command envelope. No generation.',
      inputSchema: z.object({ seriesId: id, ...envelope }).strict(),
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    withToolErrors(async (input) =>
      applySeriesCommand({
        ...input,
        command: input.command as Parameters<
          typeof applySeriesCommand
        >[0]['command'],
        origin: 'mcp',
      }),
    ),
  );
  server.registerTool(
    'bdesign_project_narrative_get',
    {
      description:
        'Read scene and Canvas directory without loading all snapshots. Missing canvasId in legacy tools always means the default Canvas.',
      inputSchema: z.object({ projectId: id }).strict(),
      annotations: { readOnlyHint: true },
    },
    withToolErrors(async ({ projectId }) => ({
      ...(await getNarrative(projectId)),
      capabilities: {
        canvasDocumentScope: true,
        canvasSchemaVersions: [3, 4, 5],
      },
    })),
  );
  server.registerTool(
    'bdesign_project_narrative_apply',
    {
      description:
        'Create/update/order/archive scenes or Canvas documents and assign scene assets/clip tags. Does not rearrange timeline clips or submit tasks.',
      inputSchema: z.object({ projectId: id, ...envelope }).strict(),
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    withToolErrors(async (input) =>
      applyNarrativeCommand({
        ...input,
        command: input.command as Parameters<
          typeof applyNarrativeCommand
        >[0]['command'],
        origin: 'mcp',
      }),
    ),
  );
  server.registerTool(
    'bdesign_shared_elements_get',
    {
      description:
        'Read immutable Series Element versions and exact consumers.',
      inputSchema: z.object({ seriesId: id }).strict(),
      annotations: { readOnlyHint: true },
    },
    withToolErrors(async ({ seriesId }) => getSharedLibrary(seriesId)),
  );
  server.registerTool(
    'bdesign_shared_elements_apply',
    {
      description:
        'Publish/archive shared assets or Elements, add versions, set the recommendation or explicitly use media in an episode. Never follows latest or runs generation.',
      inputSchema: z.object({ seriesId: id, ...envelope }).strict(),
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    withToolErrors(async (input) =>
      applySharedCommand({
        ...input,
        command: input.command as Parameters<
          typeof applySharedCommand
        >[0]['command'],
        origin: 'mcp',
      }),
    ),
  );
  server.registerTool(
    'bdesign_shared_consumers',
    {
      description:
        'Page exact consumers of one shared Element; stale cursors require a refresh.',
      inputSchema: z
        .object({
          seriesId: id,
          elementId: id,
          cursor: z.string().max(4000).optional(),
        })
        .strict(),
      annotations: { readOnlyHint: true },
    },
    withToolErrors(async (input) =>
      querySharedConsumers(input.seriesId, input.elementId, input.cursor),
    ),
  );
  server.registerTool(
    'bdesign_shared_archive_preview',
    {
      description:
        'Preview archive impact before archiving an Element or shared assets. Existing pins are retained.',
      inputSchema: z
        .object({
          seriesId: id,
          elementId: id.optional(),
          assetIds: z.array(id).max(100).optional(),
        })
        .strict(),
      annotations: { readOnlyHint: true },
    },
    withToolErrors(async (input) => {
      const { observed, ...preview } = await previewSharedArchive(input);
      return preview;
    }),
  );
  server.registerTool(
    'bdesign_shared_reference_preview',
    {
      description:
        'Preview exact consumers for keep/adopt/localize or detach. Read-only; no grant, upload or generation.',
      inputSchema: z
        .object({ request: z.record(z.string(), z.unknown()) })
        .strict(),
      annotations: { readOnlyHint: true },
    },
    withToolErrors(async ({ request }) => {
      const { observed, groups, organizations, ...preview } =
        await previewReferenceReview(
          request as Parameters<typeof previewReferenceReview>[0],
        );
      return preview;
    }),
  );
  server.registerTool(
    'bdesign_shared_reference_apply',
    {
      description:
        'Apply a reviewed reference batch atomically. A stale target or recommendation aborts every change; old clips/history remain pinned.',
      inputSchema: z
        .object({
          seriesId: id,
          commandId: id,
          idempotencyKey: id,
          expectedRevision: z.number().int().nonnegative(),
          previewToken: z.string().max(200000),
        })
        .strict(),
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    withToolErrors(async (input) =>
      applyReferenceReview({ ...input, origin: 'mcp' }),
    ),
  );
  server.registerTool(
    'bdesign_canvas_transfer_preview',
    {
      description:
        'Preview a same-Project Canvas transfer, including the complete dependency closure and blocked intents/capacity.',
      inputSchema: z
        .object({ request: z.record(z.string(), z.unknown()) })
        .strict(),
      annotations: { readOnlyHint: true },
    },
    withToolErrors(async ({ request }) => {
      const { documents, observed, ...preview } = await previewCanvasTransfer(
        request as Parameters<typeof previewCanvasTransfer>[0],
      );
      return preview;
    }),
  );
  server.registerTool(
    'bdesign_canvas_transfer_apply',
    {
      description:
        'Atomically move only a reviewed complete dependency set; never moves files or generation history.',
      inputSchema: z
        .object({
          projectId: id,
          commandId: id,
          idempotencyKey: id,
          expectedRevision: z.number().int().nonnegative(),
          previewToken: z.string().max(200000),
        })
        .strict(),
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    withToolErrors(async (input) =>
      applyCanvasTransfer({ ...input, origin: 'mcp' }),
    ),
  );
  server.registerTool(
    'bdesign_asset_details',
    {
      description:
        'Read media, same-batch outputs, exact-step historical takes and concrete Timeline adoption/source ranges. Missing historical identity is explicit.',
      inputSchema: z
        .object({
          projectId: id,
          assetId: id,
          seriesId: id.optional(),
          historyOffset: z.number().int().min(0).max(10000).default(0),
        })
        .strict(),
      annotations: { readOnlyHint: true },
    },
    withToolErrors(async (input) =>
      getScopedAssetDetails(
        input.projectId,
        input.assetId,
        input.seriesId,
        input.historyOffset,
      ),
    ),
  );
}
