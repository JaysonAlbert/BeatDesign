import { createHash } from 'node:crypto';
import { z } from 'zod';

export const seriesLimits = {
  episodes: 100,
  scenes: 200,
  canvases: 500,
  canvasesPerScene: 10,
  adoptionCanvases: 20,
  adoptionConsumers: 100,
} as const;
export const stableId = z
  .string()
  .min(1)
  .max(200)
  .refine(
    (v) =>
      v === v.trim() &&
      !['__proto__', 'prototype', 'constructor'].includes(v) &&
      !/[\x00-\x1f]/.test(v),
    'Invalid stable identity',
  );
export const displayName = z.string().trim().min(1).max(120);
export class ScopeError extends Error {
  constructor(
    readonly code:
      | 'SCOPE_MISMATCH'
      | 'NOT_FOUND'
      | 'REVISION_CONFLICT'
      | 'PREVIEW_STALE'
      | 'DEPENDENCY_BLOCKED'
      | 'CAPACITY_EXCEEDED'
      | 'CAPABILITY_REQUIRED'
      | 'IN_USE'
      | 'INVALID_COMMAND',
    message: string,
    readonly revision?: number,
  ) {
    super(message);
  }
}
export function fingerprint(value: unknown): string {
  const canonical = (v: any): any =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .filter((k) => v[k] !== undefined)
              .map((k) => [k, canonical(v[k])]),
          )
        : v;
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}
export function checkRevision(actual: number, expected: number) {
  if (!Number.isSafeInteger(expected) || expected < 0)
    throw new ScopeError(
      'INVALID_COMMAND',
      'An explicit revision is required.',
    );
  if (actual !== expected)
    throw new ScopeError(
      'REVISION_CONFLICT',
      'The workspace changed. Reload and review again.',
      actual,
    );
}
