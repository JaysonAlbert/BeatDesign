import { eq } from 'drizzle-orm';
import {
  generationAssetLink,
  generationHistory,
  projectAssetMembership,
  seriesAssetMembership,
  seriesElementVersion,
  seriesEpisode,
  seriesReferenceConsumer,
} from '@/config/db/schema';
import { getDb } from '@/core/workspace-lib/db-adapter';
import { ScopeError } from './contracts';

export async function assertAssetMayBeDeleted(assetId: string) {
  const db = await getDb();
  const checks = await Promise.all([
    db
      .select({ id: projectAssetMembership.id })
      .from(projectAssetMembership)
      .where(eq(projectAssetMembership.assetId, assetId))
      .limit(1),
    db
      .select({ id: seriesAssetMembership.id })
      .from(seriesAssetMembership)
      .where(eq(seriesAssetMembership.assetId, assetId))
      .limit(1),
    db
      .select({ id: seriesElementVersion.id })
      .from(seriesElementVersion)
      .where(eq(seriesElementVersion.assetId, assetId))
      .limit(1),
    db
      .select({ id: generationAssetLink.id })
      .from(generationAssetLink)
      .where(eq(generationAssetLink.assetId, assetId))
      .limit(1),
    db
      .select({ id: generationHistory.id })
      .from(generationHistory)
      .where(eq(generationHistory.resultAssetId, assetId))
      .limit(1),
  ]);
  if (checks.some((rows) => rows.length))
    throw new ScopeError(
      'IN_USE',
      'Media is still referenced by a project, shared library or generation history. Remove only its organization link.',
    );
}
export async function assertProjectMayBeRemoved(projectId: string) {
  const db = await getDb();
  const [episode] = await db
    .select()
    .from(seriesEpisode)
    .where(eq(seriesEpisode.projectId, projectId))
    .limit(1);
  const [consumer] = await db
    .select()
    .from(seriesReferenceConsumer)
    .where(eq(seriesReferenceConsumer.projectId, projectId))
    .limit(1);
  if (episode || consumer)
    throw new ScopeError(
      'IN_USE',
      'Detach this episode with a reviewed localization plan before removing the project.',
    );
  // Existing project removal is soft-delete, never physical Asset cleanup.
  // Published files retain their shared membership after source removal.
}
