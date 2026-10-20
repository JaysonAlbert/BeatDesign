import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// Foreign scope relationships are checked in the same immediate transaction as
// commands. Assets/projects remain the existing authorities, never copied here.
export const series = sqliteTable('series', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  revision: integer('revision').notNull().default(1),
  archivedAt: integer('archived_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
export const seriesEpisode = sqliteTable(
  'series_episode',
  {
    id: text('id').primaryKey(),
    seriesId: text('series_id').notNull(),
    projectId: text('project_id').notNull(),
    label: text('label'),
    orderKey: integer('order_key').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('series_episode_project_unique').on(t.projectId),
    index('series_episode_order_idx').on(t.seriesId, t.orderKey, t.id),
  ],
);
export const projectNarrativeState = sqliteTable('project_narrative_state', {
  projectId: text('project_id').primaryKey(),
  revision: integer('revision').notNull().default(0),
});
export const projectScene = sqliteTable(
  'project_scene',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    name: text('name').notNull(),
    summary: text('summary').notNull().default(''),
    orderKey: integer('order_key').notNull(),
    archivedAt: integer('archived_at'),
  },
  (t) => [index('project_scene_order_idx').on(t.projectId, t.orderKey, t.id)],
);
export const projectCanvasDocument = sqliteTable(
  'project_canvas_document',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    sceneId: text('scene_id'),
    name: text('name').notNull(),
    orderKey: integer('order_key').notNull(),
    storageKind: text('storage_kind').notNull(),
    documentJson: text('document_json', { mode: 'json' }).$type<unknown>(),
    version: integer('version'),
    archivedAt: integer('archived_at'),
  },
  (t) => [
    index('project_canvas_document_scope_idx').on(
      t.projectId,
      t.sceneId,
      t.orderKey,
      t.id,
    ),
  ],
);
export const seriesAssetMembership = sqliteTable(
  'series_asset_membership',
  {
    id: text('id').primaryKey(),
    seriesId: text('series_id').notNull(),
    assetId: text('asset_id').notNull(),
    sourceProjectId: text('source_project_id').notNull(),
    publishedAt: integer('published_at').notNull(),
    archivedAt: integer('archived_at'),
    provenance: text('provenance', { mode: 'json' }).$type<unknown>(),
  },
  (t) => [uniqueIndex('series_asset_unique').on(t.seriesId, t.assetId)],
);
export const seriesElement = sqliteTable(
  'series_element',
  {
    id: text('id').primaryKey(),
    seriesId: text('series_id').notNull(),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    currentVersionId: text('current_version_id').notNull(),
    archivedAt: integer('archived_at'),
  },
  (t) => [
    index('series_element_scope_idx').on(t.seriesId, t.kind, t.archivedAt),
  ],
);
export const seriesElementVersion = sqliteTable(
  'series_element_version',
  {
    id: text('id').primaryKey(),
    elementId: text('element_id').notNull(),
    assetId: text('asset_id').notNull(),
    ordinal: integer('ordinal').notNull(),
    sourceProjectId: text('source_project_id').notNull(),
    sourceElementId: text('source_element_id'),
    sourceVersionId: text('source_version_id'),
    createdAt: integer('created_at').notNull(),
    note: text('note').notNull().default(''),
  },
  (t) => [
    uniqueIndex('series_element_version_order_unique').on(
      t.elementId,
      t.ordinal,
    ),
  ],
);
export const seriesReferenceConsumer = sqliteTable(
  'series_reference_consumer',
  {
    id: text('id').primaryKey(),
    seriesId: text('series_id').notNull(),
    elementId: text('element_id').notNull(),
    versionId: text('version_id').notNull(),
    projectId: text('project_id').notNull(),
    canvasId: text('canvas_id').notNull(),
    bindingId: text('binding_id').notNull(),
    consumerCardId: text('consumer_card_id').notNull(),
    slotId: text('slot_id'),
  },
  (t) => [
    index('series_consumer_element_idx').on(t.elementId, t.versionId),
    index('series_consumer_canvas_idx').on(t.projectId, t.canvasId),
  ],
);
export const projectAssetScene = sqliteTable(
  'project_asset_scene',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    sceneId: text('scene_id').notNull(),
    assetId: text('asset_id').notNull(),
    provenance: text('provenance').notNull(),
  },
  (t) => [uniqueIndex('scene_asset_unique').on(t.sceneId, t.assetId)],
);
export const projectSceneClip = sqliteTable(
  'project_scene_clip',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    sceneId: text('scene_id').notNull(),
    clipId: text('clip_id').notNull(),
  },
  (t) => [uniqueIndex('scene_clip_unique').on(t.projectId, t.clipId)],
);
export const projectCanvasCardLocator = sqliteTable(
  'project_canvas_card_locator',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    cardId: text('card_id').notNull(),
    canvasId: text('canvas_id').notNull(),
    previousCanvasIds: text('previous_canvas_ids', { mode: 'json' })
      .$type<string[]>()
      .notNull(),
    deleted: integer('deleted').notNull().default(0),
  },
  (t) => [uniqueIndex('canvas_card_locator_unique').on(t.projectId, t.cardId)],
);
export const seriesCommandReceipt = sqliteTable(
  'series_command_receipt',
  {
    id: text('id').primaryKey(),
    seriesId: text('series_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    commandId: text('command_id').notNull(),
    requestHash: text('request_hash').notNull(),
    resultJson: text('result_json', { mode: 'json' })
      .$type<unknown>()
      .notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('series_receipt_unique').on(t.seriesId, t.idempotencyKey),
  ],
);
export const workspaceAssetRevision = sqliteTable('workspace_asset_revision', {
  id: text('id').primaryKey(),
  revision: integer('revision').notNull().default(0),
});
export const assetClockTables = [
  'asset',
  'project_asset_membership',
  'series_asset_membership',
  'project_asset_scene',
  'project_canvas_state',
  'project_canvas_document',
  'project_organization_state',
  'project_timeline_state',
  'series_element',
  'series_element_version',
  'series_reference_consumer',
] as const;

// Additive startup migration. No existing document, media or project row is
// rewritten. Keep SQL column names/types aligned with the exported Drizzle tables.
export const seriesSchemaStatements = [
  `CREATE TABLE IF NOT EXISTS workspace_asset_revision (id TEXT PRIMARY KEY NOT NULL,revision INTEGER NOT NULL DEFAULT 0)`,
  `INSERT INTO workspace_asset_revision(id,revision) VALUES('assets',0) ON CONFLICT DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS series (id TEXT PRIMARY KEY NOT NULL,name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 1,archived_at INTEGER,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS series_episode (id TEXT PRIMARY KEY NOT NULL,series_id TEXT NOT NULL,project_id TEXT NOT NULL,label TEXT,order_key INTEGER NOT NULL,created_at INTEGER NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS series_episode_project_unique ON series_episode(project_id)`,
  `CREATE INDEX IF NOT EXISTS series_episode_order_idx ON series_episode(series_id,order_key,id)`,
  `CREATE TABLE IF NOT EXISTS project_narrative_state (project_id TEXT PRIMARY KEY NOT NULL,revision INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS project_scene (id TEXT PRIMARY KEY NOT NULL,project_id TEXT NOT NULL,name TEXT NOT NULL,summary TEXT NOT NULL DEFAULT '',order_key INTEGER NOT NULL,archived_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS project_scene_order_idx ON project_scene(project_id,order_key,id)`,
  `CREATE TABLE IF NOT EXISTS project_canvas_document (id TEXT PRIMARY KEY NOT NULL,project_id TEXT NOT NULL,scene_id TEXT,name TEXT NOT NULL,order_key INTEGER NOT NULL,storage_kind TEXT NOT NULL,document_json TEXT,version INTEGER,archived_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS project_canvas_document_scope_idx ON project_canvas_document(project_id,scene_id,order_key,id)`,
  `CREATE TABLE IF NOT EXISTS series_asset_membership (id TEXT PRIMARY KEY NOT NULL,series_id TEXT NOT NULL,asset_id TEXT NOT NULL,source_project_id TEXT NOT NULL,published_at INTEGER NOT NULL,archived_at INTEGER,provenance TEXT)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS series_asset_unique ON series_asset_membership(series_id,asset_id)`,
  `CREATE TABLE IF NOT EXISTS series_element (id TEXT PRIMARY KEY NOT NULL,series_id TEXT NOT NULL,kind TEXT NOT NULL,name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',current_version_id TEXT NOT NULL,archived_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS series_element_scope_idx ON series_element(series_id,kind,archived_at)`,
  `CREATE TABLE IF NOT EXISTS series_element_version (id TEXT PRIMARY KEY NOT NULL,element_id TEXT NOT NULL,asset_id TEXT NOT NULL,ordinal INTEGER NOT NULL,source_project_id TEXT NOT NULL,source_element_id TEXT,source_version_id TEXT,created_at INTEGER NOT NULL,note TEXT NOT NULL DEFAULT '')`,
  `CREATE UNIQUE INDEX IF NOT EXISTS series_element_version_order_unique ON series_element_version(element_id,ordinal)`,
  `CREATE TABLE IF NOT EXISTS series_reference_consumer (id TEXT PRIMARY KEY NOT NULL,series_id TEXT NOT NULL,element_id TEXT NOT NULL,version_id TEXT NOT NULL,project_id TEXT NOT NULL,canvas_id TEXT NOT NULL,binding_id TEXT NOT NULL,consumer_card_id TEXT NOT NULL,slot_id TEXT)`,
  `CREATE INDEX IF NOT EXISTS series_consumer_element_idx ON series_reference_consumer(element_id,version_id)`,
  `CREATE INDEX IF NOT EXISTS series_consumer_canvas_idx ON series_reference_consumer(project_id,canvas_id)`,
  `CREATE TABLE IF NOT EXISTS project_asset_scene (id TEXT PRIMARY KEY NOT NULL,project_id TEXT NOT NULL,scene_id TEXT NOT NULL,asset_id TEXT NOT NULL,provenance TEXT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS scene_asset_unique ON project_asset_scene(scene_id,asset_id)`,
  `CREATE TABLE IF NOT EXISTS project_scene_clip (id TEXT PRIMARY KEY NOT NULL,project_id TEXT NOT NULL,scene_id TEXT NOT NULL,clip_id TEXT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS scene_clip_unique ON project_scene_clip(project_id,clip_id)`,
  `CREATE TABLE IF NOT EXISTS project_canvas_card_locator (id TEXT PRIMARY KEY NOT NULL,project_id TEXT NOT NULL,card_id TEXT NOT NULL,canvas_id TEXT NOT NULL,previous_canvas_ids TEXT NOT NULL,deleted INTEGER NOT NULL DEFAULT 0)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS canvas_card_locator_unique ON project_canvas_card_locator(project_id,card_id)`,
  `CREATE TABLE IF NOT EXISTS series_command_receipt (id TEXT PRIMARY KEY NOT NULL,series_id TEXT NOT NULL,idempotency_key TEXT NOT NULL,command_id TEXT NOT NULL,request_hash TEXT NOT NULL,result_json TEXT NOT NULL,created_at INTEGER NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS series_receipt_unique ON series_command_receipt(series_id,idempotency_key)`,
];
