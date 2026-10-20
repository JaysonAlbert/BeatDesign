import { serveLocalAsset } from '@/core/projects/serve-local-asset';
import { createFileRoute } from '@tanstack/react-router';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';

import {
  LOCAL_PROJECT_ASSET_BUCKET,
  LOCAL_PROJECT_ASSET_PROVIDER,
  resolveLocalProjectAssetPath,
} from '@/core/projects/local-project-assets';
import { isSafeInlineUploadedMediaMimeType } from '@/core/effects/validation';
import { getProjectAssetById } from '@/core/workspace-lib/assets/user-assets';


async function GET({
  request,
  params,
}: {
  request: Request;
  params: { projectId: string; assetId: string };
}) {
  const asset = await getProjectAssetById(params);
  if (
    !asset ||
    asset.storageProvider !== LOCAL_PROJECT_ASSET_PROVIDER ||
    asset.bucket !== LOCAL_PROJECT_ASSET_BUCKET
  ) {
    return Response.json({ error: 'Project asset not found' }, { status: 404 });
  }

  return serveLocalAsset(request, asset);
}

export const Route = createFileRoute(
  '/api/app/projects/$projectId/assets/$assetId'
)({
  server: { handlers: { GET } },
});
