import { apiJsonGet, apiJsonPost } from '@/lib/api-client';
import type { getNarrative, NarrativeCommand } from './narrative';
import type { getSeries, SeriesCommand } from './service';

export type NarrativeState = Awaited<ReturnType<typeof getNarrative>>;
export type SeriesState = NonNullable<Awaited<ReturnType<typeof getSeries>>>;
export const fetchNarrative = (projectId: string) =>
  apiJsonGet<NarrativeState>(
    `/api/app/projects/${encodeURIComponent(projectId)}/narrative`,
  );
export const fetchSeries = (seriesId: string) =>
  apiJsonGet<SeriesState>(`/api/app/series/${encodeURIComponent(seriesId)}`);
export const fetchSeriesList = (archived = false) =>
  apiJsonGet<SeriesState[]>(`/api/app/series/?archived=${archived}`);
export function narrativeCommand(
  projectId: string,
  expectedRevision: number,
  command: NarrativeCommand,
) {
  const commandId = crypto.randomUUID();
  return apiJsonPost<NarrativeState>(
    `/api/app/projects/${encodeURIComponent(projectId)}/narrative`,
    { commandId, idempotencyKey: commandId, expectedRevision, command },
  );
}
export function seriesCommand(
  seriesId: string,
  expectedRevision: number,
  command: SeriesCommand,
) {
  const commandId = crypto.randomUUID();
  return apiJsonPost<SeriesState>(
    `/api/app/series/${encodeURIComponent(seriesId)}/commands`,
    { commandId, idempotencyKey: commandId, expectedRevision, command },
  );
}
