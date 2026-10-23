import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJsonGet } from '@/lib/api-client';
import { executeProjectCommand } from '@/core/commands/client';
import type {
  OrganizationOperation,
  ProjectOrganizationDocument,
} from '@/core/organization/organization-document';

export type OrganizationState = {
  document: ProjectOrganizationDocument;
  revision: number;
};
export function useProjectOrganization(projectId: string) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<{
    id: string;
    revision: number;
    operations: OrganizationOperation[];
  } | null>(null);
  const lock = useRef(false);
  const query = useQuery({
    queryKey: ['project-organization', projectId],
    queryFn: () =>
      apiJsonGet<OrganizationState>(
        `/api/app/projects/${encodeURIComponent(projectId)}/organization`
      ),
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });
  async function apply(
    operations: OrganizationOperation[],
    revision = query.data?.revision ?? 0
  ) {
    if (lock.current) throw new Error('A project update is in progress.');
    if (
      pending.current &&
      JSON.stringify(pending.current.operations) !== JSON.stringify(operations)
    )
      throw new Error('Retry the pending change before editing another item.');
    pending.current ??= { id: crypto.randomUUID(), revision, operations };
    const command = pending.current;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await executeProjectCommand({
        projectId,
        expectedRevision: command.revision,
        commandId: command.id,
        idempotencyKey: command.id,
        command: { type: 'organization.apply', operations: command.operations },
      });
      pending.current = null;
      if (!result.ok) throw new Error(result.message);
      await Promise.all([
        client.invalidateQueries({
          queryKey: ['project-organization', projectId],
        }),
        client.invalidateQueries({
          queryKey: ['asset-board-folders', projectId],
        }),
        client.invalidateQueries({ queryKey: ['scoped-assets', projectId] }),
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      throw cause;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return {
    ...query,
    apply,
    busy,
    writeError: error,
    pending: pending.current !== null,
  };
}
