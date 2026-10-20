import { z } from 'zod';
import { fingerprint, ScopeError } from './contracts';

// A preview token is a stateless optimistic precondition, not an authorization
// credential. Every apply revalidates ownership and recomputes the full digest.
const tokenSchema = z
  .object({
    version: z.literal(1),
    operation: z.string().max(60),
    issuedAt: z.number().int(),
    request: z.unknown(),
    digest: z.string().length(64),
  })
  .strict();
export function createPreviewToken(
  operation: string,
  request: unknown,
  observed: unknown,
  issuedAt = Date.now(),
) {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      operation,
      issuedAt,
      request,
      digest: fingerprint({ operation, request, observed, issuedAt }),
    }),
  ).toString('base64url');
}
export function readPreviewToken(token: string, operation: string) {
  if (typeof token !== 'string' || token.length > 200_000)
    throw new ScopeError('INVALID_COMMAND', 'Invalid preview token.');
  let data: z.infer<typeof tokenSchema>;
  try {
    data = tokenSchema.parse(
      JSON.parse(Buffer.from(token, 'base64url').toString('utf8')),
    );
  } catch {
    throw new ScopeError('INVALID_COMMAND', 'Invalid preview token.');
  }
  if (
    data.operation !== operation ||
    data.issuedAt > Date.now() + 1000 ||
    Date.now() - data.issuedAt > 600_000
  )
    throw new ScopeError('PREVIEW_STALE', 'Preview expired. Review again.');
  return data;
}
export function assertPreviewToken(
  token: string,
  operation: string,
  request: unknown,
  observed: unknown,
) {
  const preview = readPreviewToken(token, operation);
  if (
    createPreviewToken(operation, request, observed, preview.issuedAt) !== token
  )
    throw new ScopeError(
      'PREVIEW_STALE',
      'Preview changed. Review the current impact again.',
    );
}
