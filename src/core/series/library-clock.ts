import { eq } from 'drizzle-orm';
import { workspaceAssetRevision } from '@/config/db/schema';
import { getDb } from '@/core/workspace-lib/db-adapter';
export async function assetLibraryRevision(): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(workspaceAssetRevision)
    .where(eq(workspaceAssetRevision.id, 'assets'))
    .limit(1);
  return row?.revision ?? 0;
}
