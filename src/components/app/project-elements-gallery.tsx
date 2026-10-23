import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AudioLines, Plus, Search, Shapes } from 'lucide-react';
import { useTranslations } from '@/core/workspace-lib/shims/next-intl';
import { apiJsonGet } from '@/lib/api-client';
import { useProjectOrganization } from './use-project-organization';
import {
  ProjectOrganizationPanel,
  type OrganizationPanelAsset,
  type OrganizationAssetQuery,
} from './project-organization-panel';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SharedElementsPanel } from './shared-elements-panel';
import { useWorkspaceScope } from './workspace-scope';

export function ProjectElementsGallery({ projectId }: { projectId: string }) {
  const t = useTranslations('Production');
  const o = useTranslations('Organization');
  const s = useTranslations('Series');
  const scope = useWorkspaceScope();
  const organization = useProjectOrganization(projectId);
  const [kind, setKind] = useState('all');
  const [query, setQuery] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [shared, setShared] = useState(false);
  const assets = useQuery({
    queryKey: [
      'element-gallery-assets',
      projectId,
      organization.data?.revision,
    ],
    queryFn: () =>
      apiJsonGet<{ assets: OrganizationPanelAsset[] }>(
        `/api/app/projects/${projectId}/organization-assets?scope=project&limit=500`
      ),
  });
  const queryAssets = (input: OrganizationAssetQuery) =>
    apiJsonGet<{ assets: OrganizationPanelAsset[]; nextCursor: string | null }>(
      `/api/app/projects/${projectId}/organization-assets?${new URLSearchParams({ scope: input.scope, folderId: input.folderId ?? '', query: input.query, limit: '100', ...(input.cursor ? { cursor: input.cursor } : {}) })}`
    );
  const elements = Object.values(
    organization.data?.document.elements ?? {}
  ).filter(
    (e) =>
      !e.deletedAt &&
      (kind === 'all' || e.kind === kind) &&
      e.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())
  );
  return (
    <section className="min-h-0 flex-1 overflow-y-auto bg-[#111214] px-5 py-6 sm:px-8">
      <div className="mb-7 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t('elements')}</h1>
        <div className="flex gap-2">
          {scope?.narrative.episode && (
            <button
              onClick={() => setShared(!shared)}
              className="h-9 rounded-lg border border-white/10 px-3 text-sm"
            >
              {s('scope_series')}
            </button>
          )}
          <button
            onClick={() => setEditId('')}
            className="flex h-9 items-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-black"
          >
            <Plus size={16} />
            {t('newElement')}
          </button>
        </div>
      </div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-3">
        <div
          className="flex flex-wrap gap-1"
          role="tablist"
          aria-label={t('elementCategories')}
        >
          {['all', 'character', 'scene', 'prop', 'voice'].map((value) => (
            <button
              key={value}
              role="tab"
              aria-selected={kind === value}
              className={`h-9 rounded-lg px-3 text-sm ${kind === value ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white'}`}
              onClick={() => setKind(value)}
            >
              {t(`kind_${value}`)}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-white/10 px-3 text-white/40">
          <Search size={15} />
          <input
            aria-label={t('searchElements')}
            placeholder={t('searchElements')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 min-w-0 bg-transparent text-sm outline-none"
          />
        </label>
      </div>
      {shared && (
        <SharedElementsPanel
          projectId={projectId}
          onChanged={() => void organization.refetch()}
        />
      )}
      {organization.error && <p role="alert">{String(organization.error)}</p>}
      {!organization.data ? (
        <p role="status">{t('loading')}</p>
      ) : !elements.length ? (
        <div className="flex min-h-80 flex-col items-center justify-center text-center">
          <Shapes size={35} className="mb-5 text-white/25" />
          <h2 className="text-lg font-semibold">
            {query ? t('noMatches') : t('noElements')}
          </h2>
          <p className="mt-2 max-w-sm text-sm leading-6 text-white/40">
            {t('elementsHint')}
          </p>
          <button
            className="mt-5 rounded-lg border border-white/15 px-4 py-2 text-sm"
            onClick={() => setEditId('')}
          >
            {t('newElement')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {elements.map((element) => {
            const asset = assets.data?.assets.find(
              (a) =>
                a.id === element.versions[element.currentVersionId]?.assetId
            );
            return (
              <button
                key={element.id}
                onClick={() => setEditId(element.id)}
                className="overflow-hidden rounded-xl border border-white/10 bg-[#17181b] text-left transition hover:border-white/25"
              >
                <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-white/[0.025]">
                  {asset?.publicUrl && asset.type === 'image' ? (
                    <img
                      src={asset.publicUrl}
                      alt={element.name}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : element.kind === 'voice' ? (
                    <AudioLines size={30} className="text-white/25" />
                  ) : (
                    <Shapes size={30} className="text-white/25" />
                  )}
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-medium">{element.name}</p>
                  <p className="mt-1 text-xs text-white/40">
                    {t(`kind_${element.kind}`)} ·{' '}
                    {Object.keys(element.versions).length} {t('versions')}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
      <Dialog
        open={editId !== null}
        onOpenChange={(open) => {
          if (!open && !organization.busy) setEditId(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto border-white/10 bg-[#17181b] text-white sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editId
                ? organization.data?.document.elements[editId]?.name
                : t('newElement')}
            </DialogTitle>
          </DialogHeader>
          {organization.writeError && (
            <p role="alert" className="text-red-300">
              {organization.writeError}
            </p>
          )}
          {editId !== null && organization.data && (
            <ProjectOrganizationPanel
              key={editId}
              embedded
              initialTab="elements"
              initialElementId={editId}
              document={organization.data.document}
              revision={organization.data.revision}
              assets={assets.data?.assets ?? []}
              onApply={organization.apply}
              onQuery={queryAssets}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
