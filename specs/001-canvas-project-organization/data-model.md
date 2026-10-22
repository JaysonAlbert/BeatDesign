# Data Model: 项目组织与模板

2026-10-20；待审核设计。所有“新增”实体尚未实现。

## 1. 权威位置与版本

| 数据 | 权威位置 | 并发版本 |
|---|---|---|
| 媒体文件、元信息与项目归属 | 原 Asset + project_asset_membership | 继续原服务 |
| 生成对象、历史输出和实际输入 | 原 Canvas / generation_history / generation_asset_link | 原记录不重写 |
| 组、布局、固定绑定、模板实例 | project_canvas_state 的 Canvas v4 文档 | Canvas revision |
| 文件夹、逻辑素材位置、Elements | 新 project_organization_state | organization revision |
| 本地可复用模板 | 新 workflow_template | 每个模板的 revision |
| 实际剪辑采用 | 原 project_timeline_state | Timeline revision |

组织表是相同 SQLite 中的附属元数据，不新建 Project、Asset 或生成状态来源。
两个组织域的实体 ID 都是稳定字符串，不把名称或数组下标当身份。

## 2. Canvas v4

保留原 cards、frames、camera、workflows；新增 `organization`：

| 字段 | 内容 |
|---|---|
| groups | 按稳定 groupId 的记录，含标题、用途、成员、折叠状态与组框 |
| elementBindings | 按 bindingId 的固定输入绑定 |
| templateInstances | 按 instanceId 的模板实例和槽绑定状态 |
| view | historyMode=current\|all；referenceMode=focused\|all |

### ShotGroup

- `id`, `name`, `role=shot|references|sound|packaging|timeline`。
- `memberCardIds`：去重有序集合；一个 card 至多属于一个组，组不能嵌套。
- `collapsed`；`summaryFrame`：折叠入口位置/尺寸；`expandedFrame`：展开边界。
- `resultCardId?`：用户指定且属于组的当前展示入口，不等于人工接受或剪辑全部采用。
- 真实成员布局只存原 `frames[cardId]` 的绝对坐标；折叠不重排。
- 运行/失败状态、采用计数、跨组关系都是派生值，不另存易过期副本。
- 解除组只移除组元数据；普通节点删除在同一增量操作中清除成员关系与对应 resultCardId。
- 删除真实节点还原子清理其 consumer/reference 绑定、实例 step 映射和槽绑定；受影响必填槽
  回到未绑定阻塞状态，不能留下指向不存在节点的元数据。
- resize 仅改变指定 summary/expanded 组框，不缩放或移动成员；展开框不得小于成员包围框。
- 空组可保留作为明确计划入口；resultCardId 为空，不伪造媒体结果。

### ElementBinding

- `id`, `consumerCardId`, `elementId`, `versionId`, `assetId`。
- `referenceCardId`：指向项目内真实固定版本 Asset 卡；相同版本可复用同一卡。
- `role`、`order`：输入用途和在 consumer.referenceCardIds 中的位置。
- `reviewedAgainstCurrentVersionId`：最近一次明确核对所见的 Element 当前版本。
- `needsReview` 为当前指针与上次复核版本不同的派生值，不改输入。
- 显式应用新版：改当前配置的绑定和真实引用；保留旧 Asset 卡、历史 snapshot 和 clip。
- 显式“保留旧版”：只更新复核标记；不声称新版已采用。
- 任何对 referenceCardIds 的编辑都必须保留一致的绑定，或通过显式 unbind 解除。

### TemplateInstance

- `id`, `templateId`, `templateRevision`, `definitionDigest`, `creationRequestHash`。
- `stepCardIds`：template local step ID → 新 card ID。
- `slotDefinitions` 与 `slotBindings`：冻结槽要求，绑定到目标 Asset 或目标 Element 固定版本。
- `groupIds` 与 `createdAt`；模板删除后，实例所需结构与槽定义仍可解释。
- `pendingRequiredSlots`、`unavailableModels` 从冻结定义、绑定和当前 catalog 计算。
- 不创建假的 Asset 节点。未绑定槽由渲染层呈现占位，由实例元数据保留语义。
- 草稿生成仍为 idle；任务 ID、output、旧运行状态和媒体 payload 不复制。
- 删除某实例的制作节点须同时维护 stepCardIds；可显式解除实例组织关系，保留真实节点。

### 归一化和兼容

- 新 reader 对已有可识别的 v3/旧形态补空 organization，在内存表示为 v4；读操作不写库。
- v4 的组、绑定和实例严格校验；非法/未来版本拒绝，不静默截断、降级或变成空项目。
- 模型引用继续只指真实 card；组 ID、未绑定 slot ID 不能混入 referenceCardIds。
- projection 可以映射显示端点，不写回原引用或 generationSnapshot。
- snapshot replacement 在归一化之前检查原始请求版本；旧写入不能抹掉现有 v4 元数据。
- canonical diff、三方 merge 和 undo/redo 全部支持这些字段。独立字段可合并；冲突成员归属、
  同字段改写、delete-vs-edit 显式报冲突，保留本地未保存输入。
- 保留生成期间 undo 的输出合并规则，不能把后来完成的 output 撤销丢失。

## 3. ProjectOrganizationDocument v1

新增表：`project_organization_state`。

- `project_id` 主键，引用现有 project；项目物理删除时级联其组织元数据。
- `schema_version=1`, `document_json`, `version`, `updated_at`。
- 没有行表示空组织文档、revision 0；第一次有效写入建 version 1，不能因读取创建行。
- document：`folders`, `assetLocations`, `elements`。
- Canvas 的撤销与布局保存不覆盖这份文档；目录操作使用显式反向命令恢复。

### AssetFolder / AssetLocation

- Folder：`id`, `name`, `parentId|null`，名称 trim + NFC，用规范化小写键检查同父目录重名。
- AssetLocation：`assetId -> folderId`；缺项表示未分类。
- 一个 Asset 多个 category membership 只形成一个目录位置；归属验证看该项目是否有 membership。
- 移动文件夹：拒绝自身/后代、同父重名及超深树；不修改实际文件或 category。
- 移除文件夹：该层素材移到父级（根目录对应未分类），直接子目录挂到父级；不递归删除。
  如会发生子目录重名，预览列出冲突并拒绝应用，先由用户重命名。
- 文件夹影响预览绑定 organization revision；应用时 revision 不同必须重新预览。

### ReusableElement / ElementVersion

- Element：`id`, `name`, `kind=character|scene|prop|voice`, `description`, `currentVersionId`,
  `versions`, `deletedAt|null`。
- Version：`id`, `assetId`, `mediaType=image|audio`, `createdAt`；追加后不能改写。
- 第一版 character/scene/prop 使用图片，voice 使用音频；模型是否接受该输入由原 catalog 校验。
- `currentVersionId` 必须是自身已有版本，版本 Asset 属于该项目。
- 修改当前版本仅修改组织文档；未变更 current 指针的追加版本不会触发消费者复核。
- 有当前 Canvas 绑定时不能删除；解绑后软删除，旧版本仍可用于解释历史。
- 恢复入口可清除 deletedAt，但不能改写旧版本；被绑定版本的 Asset 不允许通过组织操作删除。
- Elements 页的使用者是 Canvas 绑定的反向查询，不另存消费者列表。

## 4. WorkflowTemplateDefinition v1

新增安装级表：`workflow_template`，与源项目生命周期分离。

- `id`, `name`, `schema_version=1`, `definition_json`, `revision`, `created_at`, `updated_at`。
- 本地跨项目可选用；没有用户、云端或发布对象，也不向模型提供模板 ID。
- 改名/保存新定义做 CAS；删除仅移除库定义，不删已实例化节点和冻结槽要求。
- `project_workflow_state` 目前没有运行服务；保留原样，不另行保存相同定义。

Definition 内容：

| 内容 | 保存内容 |
|---|---|
| steps | localId、name、kind=text\|generation、白名单配置、相对 frame |
| edges | fromStepId、toStepId、order；文字/生成步骤之间的内部关系 |
| slots | id、label、mediaType=image\|video\|audio、required、consumers(stepId/order/role) |
| groups | 可选模板内扁平分组，成员仅为本地 step ID |

- 配置白名单：textRole/textContent，generationMode/analysisDepth，prompt，逻辑 modelId，
  aspectRatio/outputQuality/duration/language/mode/variant/quality，以及现有已知的模型控件字段。
  每个允许字段显式列举并走同一 schema；不接收任意 parameters 对象或 provider 原始字段。
- 禁止结构字段：assetId、媒体 URL、objectKey、本机路径、task/run/upload 标识、状态/error、
  output、generationSnapshot、pinnedOutput、timeline/render ID、凭据与脚本。
- 源媒体/Element/未选中的外部引用变成 slot，不保存源项目的媒体身份。
- 正文是可见可编辑的纯文本，不扫描本机凭据，也不解释 URL/路径/指令为实际绑定。
- 内部边与槽共同保存每个消费者的输入顺序，数量仍受模型及每卡二十引用限制。
- 跨项目实例化只能显式绑定目标项目的媒体或 Element；缺失必填槽保留为阻塞草稿。
- 创建 ID 从 commandId/instanceId/localId 稳定派生，实例之间不同、同请求重试一致。
- 实例化后节点数/文档大小超限则全部回滚；折叠不抵扣节点配额。

## 5. 原子性、回执与修订

- 为 receipt 新增可空 `request_hash`；旧行保持可读，不伪造旧指纹。
- 对新组织/模板/扩展 Canvas 命令，规范化操作、显式版本和稳定 ID 形成请求指纹。
  trusted origin、UI 瞬态和服务端派生 URL 不参与内容身份；同键不同语义/不同前置版本拒绝。
- SQLite 写事务内：读 receipt → 校验所有相关 revision 与 Asset/Element → 纯操作 →
  写受影响状态及 revision → 写成功 receipt → commit。任何失败整体回滚。
- 同一 tx 注入所有数据 helper，不能从事务内跳到全局 getDb；in-flight 去重也比较指纹。
- 新命令遇冲突返回现有 REVISION_CONFLICT，带最新相关 revision；不自动覆盖用户选择。
- 有旧 receipt 但无指纹时，不用它确认新的组织操作；返回需新 commandId/key 的可解释错误。
- receipt 沿用现有有界保留，不当长期日志。稳定对象/实例 ID 和 creationRequestHash
  在 receipt 过期后仍防止同一实例被重复创建；不同内容复用同 ID 明确拒绝。
- Element 绑定、Element 删除检查都在这条边界，解决不同进程检查/写入之间的竞态。
- 保护不限于新操作：所有写入 v4 的 saveProjectSnapshot、旧 upsert_card/set_references/
  remove_card、UI replacement、undo/restore、系统结果同步与冲突恢复，必须在同一写事务内
  重验最终绑定和组织状态。现有 helper 需接受 tx 并统一走这个边界，不能保留旁路。
- 新命令/含新增操作的 batch 在 UI/MCP 随机 ID fallback 之前强制校验显式 envelope；
  legacy-only 请求保留原缺省兼容。新命令不能进入旧的自动换 revision 重试包装器。

## 6. 初版资源保护

| 对象 | 拟定上限 |
|---|---:|
| Canvas 卡片/每卡引用/文档 | 现有 200 / 20 / 2 MiB |
| Canvas 组 / 模板实例 | 64 / 100（成员仍受卡片总数约束） |
| 项目组织文档 | 2 MiB |
| 文件夹 / 深度（根为 0） | 500 / 8 |
| 目录位置 / Elements / 每个 Element 版本 | 10000 / 256 / 100 |
| 单模板 steps / slots / definition | 100 / 100 / 128 KiB |
| Asset 查询页 | 默认 100，最大 500；cursor 分页 |

这些是有界初版保护，不是建议填满的目标。独立上限与总字节限额同时生效；超限报错，
不 slice 掉用户已有组织信息。单个标题上限 200 字符，说明 2000；沿用原文字/提示词限制。

## 7. 派生数据与状态

- 组：expanded ↔ collapsed，只改组织展示；moving 平移 canonical frames；removed 解除成员。
- Element：active → 新增版本 → current 切换 → 消费者 needs_review；明确采用或保留后已复核。
- 模板实例：draft_unbound → draft_bound；模型不可用为并行阻塞状态；不自动进入 running。
- TimelineUsage：只读 getTimelineClipSource 的结果，包含 source asset/take/源区间、
  clip/track ID、时间线位置、hidden/muted、timelineRevision；不当作额外持久化实体。
- revision 查询增加 organization；模板库读取用内容 ETag/面板可见刷新，实例版本不随库变动。

## 8. 迁移与回退

只添加两张表和 receipt 可空列，生成 schema.ts 仍走既有脚本；实现阶段验证空库与旧库升级。
已有业务行、文件路径、哈希、membership、generation、Timeline 不修改。
v4 在第一次明确写入时保存；从 v4 回退旧程序只允许使用迁移前独立数据副本。
当前计划不对主 data/ 执行迁移，也不自动重启 Web/MCP。
