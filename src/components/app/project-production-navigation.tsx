import { useState, useRef, type ReactNode } from 'react';
import { useSearch } from '@tanstack/react-router';
import {
  ArrowLeft,
  FileText,
  Shapes,
  Workflow,
  Scissors,
  Film,
  Folder,
  Plus,
  ChevronDown,
  ChevronRight,
  PanelsTopLeft,
  Images,
  Search,
  PanelLeftClose,
} from 'lucide-react';
import { useTranslations } from '@/core/workspace-lib/shims/next-intl';
import { useProjectOrganization } from './use-project-organization';
import {
  useWorkspaceScope,
  useScopeNavigation,
  scopeSearch,
} from './workspace-scope';
import { ProjectSettingsDialog } from './project-settings-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Link } from '@/core/i18n/navigation';
import type { WorkspaceMode } from '@/config/workspace-modes';

export function ProjectProductionNavigation({
  projectId,
  name,
  mode,
  onCollapse,
}: {
  projectId: string;
  name: string;
  mode: WorkspaceMode;
  onCollapse: () => void;
}) {
  const t = useTranslations('Production');
  const s = useTranslations('Series');
  const scope = useWorkspaceScope();
  const navigate = useScopeNavigation();
  const search = useSearch({ strict: false }) as Record<
    string,
    string | undefined
  >;
  const organization = useProjectOrganization(projectId);
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const folderCommandId = useRef(crypto.randomUUID());
  const [parentId, setParentId] = useState('');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string[]>([]);
  const row =
    'flex h-10 min-w-0 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-white/65 transition hover:bg-white/7 hover:text-white';
  const go = (href: string) => {
    void navigate(href);
    if (window.matchMedia('(max-width: 1023px)').matches) onCollapse();
  };
  const nav = (
    label: string,
    Icon: typeof FileText,
    href: string,
    active: boolean
  ) => (
    <button
      className={`${row} ${active ? 'bg-white/10 !text-white' : ''}`}
      aria-current={active ? 'page' : undefined}
      onClick={() => go(href)}
    >
      <Icon size={17} className="shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
  const folders = Object.values(organization.data?.document.folders ?? {});
  const renderFolders = (parent: string | null, depth = 0): ReactNode =>
    folders
      .filter((f) => f.parentId === parent)
      .map((folder) => {
        const children = folders.some((f) => f.parentId === folder.id);
        const isExpanded = expanded.includes(folder.id) || Boolean(query);
        const match =
          !query ||
          folder.name.toLocaleLowerCase().includes(query.toLocaleLowerCase());
        return (
          <div key={folder.id} style={{ paddingLeft: depth ? 12 : 0 }}>
            {match && (
              <div className="flex items-center">
                <button
                  className="flex size-6 shrink-0 items-center justify-center text-white/40"
                  disabled={!children}
                  aria-label={t('expandFolder', { name: folder.name })}
                  aria-expanded={isExpanded}
                  onClick={() =>
                    setExpanded((old) =>
                      old.includes(folder.id)
                        ? old.filter((id) => id !== folder.id)
                        : [...old, folder.id]
                    )
                  }
                >
                  {children ? (
                    isExpanded ? (
                      <ChevronDown size={12} />
                    ) : (
                      <ChevronRight size={12} />
                    )
                  ) : (
                    <span className="w-3" />
                  )}
                </button>
                <button
                  className={`${row} !gap-2 !px-1 ${search.folderId === folder.id ? 'bg-white/10 !text-white' : ''}`}
                  onClick={() =>
                    go(
                      `/assets/${projectId}?scope=episode&folderId=${encodeURIComponent(folder.id)}`
                    )
                  }
                >
                  <Folder size={15} />
                  <span className="truncate">{folder.name}</span>
                </button>
              </div>
            )}
            {(isExpanded || query) && renderFolders(folder.id, depth + 1)}
          </div>
        );
      });
  return (
    <div className="flex h-full flex-col bg-[#111214] p-3 text-white">
      <div className="mb-5 flex items-center justify-between">
        <Link
          href="/projects"
          onClick={(event) => {
            event.preventDefault();
            go('/projects');
          }}
          className="flex h-9 items-center gap-2 px-2 text-sm text-white/65"
        >
          <ArrowLeft size={16} />
          {t('projects')}
        </Link>
        <button
          aria-label={t('collapse')}
          onClick={onCollapse}
          className="rounded p-2 text-white/40 hover:bg-white/10"
        >
          <PanelLeftClose size={16} />
        </button>
      </div>
      <p className="mb-5 truncate px-3 text-sm font-semibold" title={name}>
        {name}
      </p>
      <nav
        aria-label={t('projectNavigation')}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {nav(
          t('brief'),
          FileText,
          `/studio/${projectId}?panel=brief`,
          search.panel === 'brief'
        )}
        <ProjectSettingsDialog
          projectId={projectId}
          triggerLabel={t('settings')}
        />
        {nav(
          t('elements'),
          Shapes,
          `/assets/${projectId}?view=elements`,
          search.view === 'elements'
        )}
        <details open className="mt-3">
          <summary className="flex h-9 cursor-pointer items-center justify-between px-3 text-xs text-white/40">
            {t('tools')}
            <ChevronDown size={13} />
          </summary>
          <div className="pl-2">
            {nav(
              t('studio'),
              Film,
              `/studio/${projectId}`,
              mode === 'studio' && !search.panel
            )}
            {nav(
              t('canvas'),
              Workflow,
              `/canvas/${projectId}${scope ? scopeSearch(scope) : ''}`,
              mode === 'canvas'
            )}
            {nav(
              t('editor'),
              Scissors,
              `/editor/${projectId}`,
              mode === 'editor'
            )}
          </div>
        </details>
        <div className="mb-2 mt-6 flex items-center justify-between px-3 text-xs text-white/40">
          <span>{t('folders')}</span>
          <button
            aria-label={t('newFolder')}
            onClick={() => setFolderOpen(true)}
          >
            <Plus size={15} />
          </button>
        </div>
        {nav(
          t('allAssets'),
          Images,
          `/assets/${projectId}?scope=episode`,
          mode === 'assets' &&
            !search.view &&
            !search.folderId &&
            !search.sceneId
        )}
        {folders.length > 6 && (
          <label className="my-2 flex items-center gap-2 px-3 text-white/40">
            <Search size={13} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t('searchFolders')}
              placeholder={t('searchFolders')}
              className="h-8 min-w-0 w-full bg-transparent text-xs outline-none"
            />
          </label>
        )}
        {renderFolders(null)}
        <button
          className={`${row} !text-white/40`}
          onClick={() => setFolderOpen(true)}
        >
          <Plus size={16} />
          {t('newFolder')}
        </button>
        <div className="mb-2 mt-6 flex items-center justify-between px-3 text-xs text-white/40">
          <span>{t('sceneCanvases')}</span>
          <button
            aria-label={t('manageScenes')}
            onClick={() => go(`/studio/${projectId}?panel=scenes`)}
          >
            <PanelsTopLeft size={14} />
          </button>
        </div>
        {scope?.narrative.scenes
          .filter((scene) => !scene.archivedAt)
          .map((scene) => (
            <button
              key={scene.id}
              className={`${row} ${search.sceneId === scene.id ? 'bg-white/10 !text-white' : ''}`}
              onClick={() =>
                go(
                  `/assets/${projectId}?scope=scene&sceneId=${encodeURIComponent(scene.id)}`
                )
              }
            >
              <PanelsTopLeft size={15} />
              <span className="truncate">{scene.name}</span>
            </button>
          ))}
        <button
          className={`${row} !text-white/40`}
          onClick={() => go(`/studio/${projectId}?panel=scenes`)}
        >
          <Plus size={16} />
          {t('manageScenes')}
        </button>
        {scope?.narrative.episode && (
          <button
            className={`${row} mt-4`}
            onClick={() => go(`/series/${scope.narrative.episode!.seriesId}`)}
          >
            {s('overview')}
          </button>
        )}
      </nav>
      <Dialog
        open={folderOpen}
        onOpenChange={(value) => {
          if (!organization.busy) setFolderOpen(value);
        }}
      >
        <DialogContent className="border-white/10 bg-[#17181b] text-white">
          <DialogHeader>
            <DialogTitle>{t('newFolder')}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void organization
                .apply([
                  {
                    type: 'create_folder',
                    folderId: folderCommandId.current,
                    name: folderName.trim(),
                    parentId: parentId || null,
                  },
                ])
                .then(() => {
                  setFolderOpen(false);
                  setFolderName('');
                  folderCommandId.current = crypto.randomUUID();
                })
                .catch(() => undefined);
            }}
          >
            <input
              autoFocus
              aria-label={t('folderName')}
              disabled={organization.pending}
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              maxLength={200}
              placeholder={t('folderName')}
              className="h-11 w-full rounded-lg border border-white/15 bg-white/5 px-3"
            />
            <select
              aria-label={t('parentFolder')}
              disabled={organization.pending}
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="h-10 w-full rounded-lg bg-[#202126] px-3"
            >
              <option value="">{t('projectRoot')}</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            {organization.writeError && (
              <p role="alert" className="text-sm text-red-300">
                {organization.writeError}
              </p>
            )}
            <button
              disabled={organization.busy || !folderName.trim()}
              className="h-10 rounded-lg bg-white px-5 text-sm text-black disabled:opacity-40"
            >
              {t('create')}
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
