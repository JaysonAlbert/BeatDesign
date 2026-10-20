# Proposed Command / Query Contracts
设计约定及已实现的接口边界；实际参数映射见下方“实现映射”。所有写入复用 Command Kernel，不从 UI/MCP 直接写数据库。
详见 [数据模型](../data-model.md) 与 [交互约定](ui.md)。

## 1. Envelope、版本与回执

- Project：沿用 /api/app/projects/:projectId/commands，新增可选 canvasId，省略仅默认画布；原命令兼容。新文档操作必须显式 canvasId。
- Series：拟增 /api/app/series/:seriesId/commands，独立 Series envelope，不携带虚假 projectId；series.create 用客户端稳定 seriesId、expectedSeriesRevision=0。
- 两类都要求新命令有 commandId、idempotencyKey、类型化 payload 与所需 expectedRevisions；origin 由 UI/MCP 传输层设置，客户端传入即拒绝。
- Project receipt 继续项目域，但 requestHash 必含 canvasId/全部参数。Series receipt 用 (seriesId,idempotencyKey)，与原逻辑共用回执适配层。
- expectedRevisions 只包含命令实际触及的资源并校验完整性：series、narrative[projectId]、organization[projectId]、canvas[projectId,canvasId]、timeline[projectId]。
- 原 canvas.apply 的 expectedRevision 仍只指指定 Canvas，禁止把 Series/Timeline revision 填进去。跨域命令使用向量，响应返回各变化域。
- 已成功同键同哈希先返回原回执；同键不同 payload/canvasId 拒绝。当前 CAS 失败不部分写，也不缓存成成功。
- 新错码：SCOPE_MISMATCH、PREVIEW_STALE、DEPENDENCY_BLOCKED、CAPACITY_EXCEEDED、CAPABILITY_REQUIRED、IN_USE；保留 INVALID_COMMAND/NOT_FOUND/REVISION_CONFLICT。统一错误包含资源/最新 revision/可执行下一步，changedIds=[]。
- 每写请求 ≤2 MiB、≤500 操作；复合跨集采用 ≤20 个 Canvas、≤100 个消费者，超限在预览阶段给出分批建议。多批之间不承诺原子；每批必须重新预览并显式执行。
- 不提供整季 replace、SQL、任意路径或远端 URL 直通。现有 trusted-local-request 和媒体归属校验保留。

## 2. Series 域命令

| command | 必需输入 | 行为 |
|---|---|---|
| series.create | seriesId, name | 新建空聚合，无默认生成或 Project 副本 |
| series.update | name?, description? | 仅元信息 |
| series.set_episode_order | orderedEpisodeIds | 包含所有活跃集且无重复，原子改序 |
| series.attach_episode | episodeId, projectId, label?, expected narrative revision | 现有 Project 不属于其他 Series；不改内容 |
| series.detach_episode | projectId, previewToken, localizePlan | 明确本地化共享绑定后解除关系；保留媒体/来源/时间线 |
| series.archive / restore | seriesId | 归档禁止新发布/绑定，保留旧读取 |
| series.assets.publish | assetIds, sourceProjectId, source organization revision | 当前所属集发布自己的媒体；≤100，建立共享 membership，不复制 |
| series.assets.archive / restore | assetIds, previewToken | 停止发现，不删既有 pin |
| series.elements.publish | elementId, versionId, name, kind, sourceProjectId, assetId, sourceElementId?, sourceVersionId? | 新身份+首版；源必须属于本 Series 的集，原项目 Element 不改 |
| series.elements.add_version | elementId, versionId, sourceProjectId, assetId, note? | 追加不可变版本，不自动推荐 |
| series.elements.set_current | elementId, observedCurrentVersionId, versionId | 仅推荐指针 |
| series.elements.archive / restore | elementId, previewToken | 软归档，旧消费者可读 |
| series.references.adopt | previewToken, selectedConsumers, targetVersionId, expectedRevisions | 单事务更新指定消费者及必要 membership；不提交任务 |
| series.references.localize | projectId, previewToken, selectedConsumers, expectedRevisions | 将所选共享绑定显式转为本项目固定版本身份；保留源身份/版本provenance及现有媒体，可在脱离前分批执行 |

publish、adopt、detach 会触及项目边界：事务内重新确认项目归属/源 Asset/版本状态。Series 归档与 bind 并发不能绕过检查。跨 Series 发布不提供隐式路径，须显式导入到本系列成员后重新发布，保留来源记录。

## 3. Project / Canvas 域

| command 或 operation | 必需输入 | 行为 |
|---|---|---|
| narrative.apply:create_scene | sceneId, name, summary?, orderKey | 单片可用；不自动拆旧内容 |
| narrative.apply:update_scene / set_scene_order | sceneId/orderedSceneIds | 仅叙事元数据 |
| narrative.apply:archive_scene / restore_scene | sceneId, previewToken | 所属文档保留，导航默认隐藏，历史仍可读 |
| narrative.apply:assign_scene_assets | sceneId, assetIds | 显式标签，不复制文件 |
| narrative.apply:set_clip_scene | clipId, sceneId or null; expected timeline revision | 校验真实 clip，标签变更不改时间线正文/顺序 |
| canvas.document.create | canvasId, sceneId?, name | 创建空 v5 文档；默认文档不重复创建 |
| canvas.document.update | canvasId, name?, sceneId?, orderKey? | 目录变更用 narrative revision，不改正文 |
| canvas.document.archive / restore | canvasId, previewToken | 默认文档不可归档；历史和未归场入口保留 |
| canvas.transfer | sourceCanvasId, targetCanvasId, previewToken, exactSelection, expectedRevisions | 仅同项目、依赖闭包完整，原子转移 |
| canvas.apply | canvasId, expectedRevision, operations | 原有组/卡/布局/模板等操作按文档执行，维持不变量 |
| canvas.apply:bind_element | canonical scoped reference + consumer info | 单事务建立必要 project Asset membership、绑定与使用索引 |
| canvas.apply:review_element_binding | bindingId, observedCurrentVersionId, decision=keep or adopt | keep 仅更新审阅标记；adopt 需预览所选目标；不替换旧生成 |
| assets.use_shared | seriesId, assetIds, sceneId?, expectedRevisions | 先授予当前集 membership，可选归场；不创建节点或生成 |
| workflow.template.capture / instantiate | explicit canvasId + existing fields | 服务端统一解析目标范围的精确槽；模板不能带跨集自动授权 |

共享 bind/use 不要求前端先拿 foreign Asset 绕过校验。后端只在验证 Series relation+共享版本后调用既有 linkProjectAsset；membership/category/provenance 与绑定在同一事务。解除绑定不自动删除 membership 或媒体。

## 4. Preview 合同

只读 preview 不写文档、membership 或生成 intent。类型包括 adopt、localize、detach_episode、archive、transfer、legacy_migration。本地化以源Series身份/版本建立稳定映射并复用本集同源副本，不按同名合并，不改历史；同时更新绑定、模板槽与消费者索引并失效未提交intent。

返回 previewToken（10分钟有效的无状态乐观前置条件摘要）、operation、规范化 payloadDigest、expectedRevisions、精确目标列表、版本/Asset 差异、阻塞原因、影响及 limits。Token 必须绑定完整参数、所有目标 revision、目标当前推荐版本；apply 再查可用性、关系与正文，任何不符 PREVIEW_STALE。不通过仅客户端传入的 consumers 信任范围。

adopt 例：
```json
{
  "seriesId": "series-A",
  "elementId": "character-A",
  "fromVersionId": "version-1",
  "targetVersionId": "version-2",
  "selectedConsumers": [
    {"projectId": "episode-1", "canvasId": "scene-canvas-1", "bindingId": "binding-1"}
  ]
}
```
preview 返回每个目标实际旧版，选中过滤只改变待选清单，不写数据。执行时向量须覆盖 Series+所有目标 Canvas 及必要组织域。不能用一集的 revision 代表整批。若新版本需要新增参考卡，预览包含其稳定 ID、容量与引用位置；禁止覆盖仍被未选消费者引用的旧卡。消费者可选范围仅为活跃未来输入/槽，历史记录和 clip 不参与采用。

transfer preview 还包含引用闭包、运行任务阻塞、完整模板实例、容量和 locator 转移映射；用户明确采用该闭包后执行。不会静默增加依赖选择。

## 5. Query 与 MCP 对应

| 查询 | 参数及结果 | 拟议 MCP（名称在实现阶段统一注册） |
|---|---|---|
| series.list/get | 分页总览、revision、分集项目指针，轻量元信息 | bdesign_series_list/get |
| narrative.get | projectId；场次和文档目录+narrative revision；不读所有快照 | bdesign_project_narrative_get |
| canvas.document.get/revision | projectId, canvasId；单文档正文或轻量 revision | 既有 canvas_get/revision 增 canvasId |
| assets.query | scope=scene/episode/series, IDs, mediaType, elementKind, folderId, usage, query, cursor, limit | 既有 assets query 扩 scope |
| consumers.query | exact element/version or asset；精确画布/步骤/clip locator、revision | bdesign_shared_consumers_get |
| preview | operation+payload；返回上节结构 | bdesign_series_preview / canvas_transfer_preview |
| writes | 类型化语义命令 | bdesign_series_apply / narrative_apply，canvas_apply 扩 canvasId |

query limit 默认100、上限500；cursor 包含 scope/filters/revision 和稳定排序键；过期返回 CURSOR_STALE。作用域决定 folderId 的归属，不能拿某集目录筛共享库。总量只有计算准确时返回数值，否则 total=null。过滤数据源是 SQL/服务端索引，不先读取所有媒体。

MCP active project 仍为一个集；active canvasId 是可选导航上下文，工具写入必须显式目标，省略始终默认文档而非会话猜测。Series 工具不偷偷切换 active Project。查询和写入均返回 host-neutral deep links。

## 6. 生成、导入与异步边界

- Canvas generation request、precheck result、upload intent、final submit、source digest、结果定位统一含 projectId+canvasId+sourceCardId。
- 一个 intent 只能使用其审阅文档的冻结输入；相同卡 ID 出现在另一文档也不能替代；旧请求仅默认文档。
- 将待提交源改版或转移后重新 precheck，旧 intent 不得重试提交。
- 上传/导入成功总是先成为本项目 Asset；创建卡片须显式目标 Canvas，并确认目标仍活跃、revision 合法。目标关闭/归档时 Asset 保留在项目素材库并返回可恢复提示，不丢文件。
- 已运行任务输出仍入原 Project Asset/History；用户切场不重定向 placement，不自动追加到当前场。若原文档已归档，结果在素材库可找，来源保持。
- Studio 生成可带 sceneId 作归场上下文，但不冒充 Canvas source；Editor 只通过本集 membership 的具体 Asset。

## 实现映射（2026-10-21）

- 语义名称在 `src/core/series/{service,narrative,shared-assets,reference-review,canvas-transfer}.ts` 中以严格判别联合实现。Series/场次写使用 `commandId/idempotencyKey/expectedRevision/command`；多文档revision向量在preview token中捕获并由apply重读验证，响应逐文档返回新revision。
- HTTP：`/api/app/series/`、`/:seriesId`、`/commands`、`/shared`、`/consumers`、`/archive-preview`、`/reference-review`、`/assets/:assetId`；Project路径下 `/narrative`、`/canvas-transfer`、`/scoped-assets`、`/asset-details/:assetId`。
- Canvas snapshot/revision GET的`canvasId`为query，PUT/commands为body；生成请求显式canvasId进入source digest及历史provenance。upload intent沿用现有sourceCardId+sourceContextDigest存储，摘要包含实际canvasId；不另建不受校验的intent存储。
- `narrative` 命令为 `create_scene/update_scene/set_scene_order/set_scene_archived/create_canvas/update_canvas/assign_scene_assets/set_clip_scene`。场次/文档归档UI先展示数量与影响并固定narrative revision确认；不删除正文或文件。共享素材/Element归档强制服务端preview token。
- 预览摘要是并发前置条件，**不是授权凭证**：每次apply重新检查所属、媒体、推荐版本、全部正文和revision。不得将其描述为签名认证。
- 共享使用位置按100条分页；Elements列表保留有界消费者摘要与准确总数。素材查询默认100、上限500，`includeArchived=true`可发现共享软归档素材；过期cursor返回冲突，重新查询。
- MCP入口在 `src/mcp/series-tools.ts`；清单以 `src/mcp/tools.ts` 为准。`bdesign_shared_consumers`与`bdesign_shared_archive_preview`补充分页和归档预览。旧 `bdesign_asset_query` 的current/project语义保留，scene/episode/series走同一范围查询服务。
