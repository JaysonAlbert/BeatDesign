import { ZodError } from 'zod';
import { ScopeError } from './contracts';
import { readRequestJsonWithLimit } from '@/lib/request-body-limit';
import { validateTrustedWorkspaceJsonMutation } from '@/lib/trusted-local-request';

export async function seriesResponse(run: () => Promise<unknown>) {
  try {
    return Response.json(await run(), {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    const code = error instanceof ScopeError ? error.code : 'INVALID_COMMAND';
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Workspace operation failed.',
        code,
        ...(error instanceof ScopeError ? { revision: error.revision } : {}),
        ...(error instanceof ZodError ? { issues: error.issues } : {}),
      },
      {
        status:
          code === 'NOT_FOUND'
            ? 404
            : code === 'REVISION_CONFLICT' || code === 'PREVIEW_STALE'
              ? 409
              : 400,
      },
    );
  }
}
export async function readSeriesMutation(request: Request) {
  const trust = validateTrustedWorkspaceJsonMutation(request);
  if (!trust.ok) throw new ScopeError('INVALID_COMMAND', trust.message);
  const input = await readRequestJsonWithLimit<Record<string, unknown>>(
    request,
    2 * 1024 * 1024,
  );
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new ScopeError('INVALID_COMMAND', 'Expected an object.');
  if ('origin' in input)
    throw new ScopeError(
      'INVALID_COMMAND',
      'Origin is assigned by the transport.',
    );
  return input;
}
