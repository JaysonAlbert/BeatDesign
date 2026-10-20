import { and, eq, desc, inArray, lt, or } from 'drizzle-orm';
import {
  projectCommandReceipt,
  seriesCommandReceipt,
} from '@/config/db/schema';
import { withDatabaseTransaction } from '@/core/db/transaction-context';
import { getDb } from '@/core/workspace-lib/db-adapter';
import { fingerprint, ScopeError, stableId } from '@/core/series/contracts';

// Series and narrative semantic commands use the same transaction/receipt
// boundary as Canvas commands, without inventing an owning episode for Series.
export function persistScopedWrite<T>(
  input: {
    scope: 'project' | 'series';
    scopeId: string;
    commandId: string;
    idempotencyKey: string;
    expectedRevision: number;
    command: unknown;
    origin?: 'ui' | 'mcp';
  },
  run: () => Promise<T>,
): Promise<T> {
  stableId.parse(input.scopeId);
  stableId.parse(input.commandId);
  stableId.parse(input.idempotencyKey);
  if (
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0
  )
    throw new ScopeError(
      'INVALID_COMMAND',
      'An explicit nonnegative revision is required.',
    );
  const hash = fingerprint(input);
  if (Buffer.byteLength(JSON.stringify(input)) > 2 * 1024 * 1024)
    throw new ScopeError('CAPACITY_EXCEEDED', 'Command exceeds 2 MiB.');
  return withDatabaseTransaction(async () => {
    const db = await getDb();
    const table =
      input.scope === 'series' ? seriesCommandReceipt : projectCommandReceipt;
    const scopeColumn =
      input.scope === 'series'
        ? seriesCommandReceipt.seriesId
        : projectCommandReceipt.projectId;
    const [cached] = await db
      .select()
      .from(table)
      .where(
        and(
          eq(scopeColumn, input.scopeId),
          eq(table.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (cached) {
      if (cached.commandId !== input.commandId || cached.requestHash !== hash)
        throw new ScopeError(
          'INVALID_COMMAND',
          'Idempotency key is bound to another request.',
        );
      return cached.resultJson as T;
    }
    const result = await run();
    const values = {
      id: fingerprint([input.scope, input.scopeId, input.idempotencyKey]),
      idempotencyKey: input.idempotencyKey,
      commandId: input.commandId,
      requestHash: hash,
      resultJson: result,
    };
    if (input.scope === 'series')
      await db
        .insert(seriesCommandReceipt)
        .values({ ...values, seriesId: input.scopeId, createdAt: Date.now() });
    else
      await db.insert(projectCommandReceipt).values({
        ...values,
        projectId: input.scopeId,
        origin: input.origin ?? 'ui',
        commandType: 'narrative.apply',
        createdAt: new Date(),
      });
    // Same bounded 24-hour / 2,000-receipt policy as the existing kernel.
    const overflow = await db
      .select({ id: table.id })
      .from(table)
      .where(eq(scopeColumn, input.scopeId))
      .orderBy(desc(table.createdAt))
      .limit(500)
      .offset(2000);
    const cutoff = Date.now() - 86_400_000;
    await db.delete(table).where(
      and(
        eq(scopeColumn, input.scopeId),
        or(
          lt(
            table.createdAt,
            input.scope === 'series' ? cutoff : new Date(cutoff),
          ),
          overflow.length
            ? inArray(
                table.id,
                overflow.map((r: { id: string }) => r.id),
              )
            : undefined,
        ),
      ),
    );
    return result;
  });
}
