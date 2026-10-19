# Command and Query Contracts

2026-10-20，当前特性接口约定；实现与实际验证见 ../verification.md。
类型、字段和资源约束以 [data-model.md](../data-model.md) 为准。

## 1. 公共边界

- UI 写入继续 `POST /api/app/projects/:projectId/commands`，服务端设置 origin=ui，
  原 trusted-local-request 校验和 2 MiB body 限制保留；客户端不能提供 origin。
- MCP tools 调用同一个 `persistBeatDesignCommand` 并由传输层指定 origin=mcp。
- 每条新写请求必须带稳定 commandId、idempotencyKey、expectedRevision；
  参数不完整、跨项目引用、超限、旧 revision 均不能部分应用。
- 对新命令或含新增操作的 Canvas batch，在现有 UI/MCP 随机 ID fallback 之前条件校验
  上述字段，缺省直接拒绝；legacy-only 请求保留原缺省兼容。
- 批次最多 500 操作；无 UI/MCP 私有写库路径，无全量 replace 工具。
- `revision` 对应该命令主写入域；复合命令还返回各相关 revision，不把三种版本混为一谈。

## 2. organization.apply

`expectedRevision` = organization revision，空文档为 0。操作如下：

| operation | 必需信息 | 语义 |
|---|---|---|
| create_folder | folderId, name, parentId | 稳定 ID 创建；校验树与同层名称 |
| rename_folder | folderId, name | 仅改显示名 |
| move_folder | folderId, parentId | 整个子树移动，拒绝循环/超深/重名 |
| remove_folder | folderId, previewRevision | 本层素材及直接子目录提升到父级 |
| assign_assets | assetIds, folderId\|null | 去重批量逻辑归类；null = 未分类 |
| create_element | elementId, name, kind, description, versionId, assetId | 建立首个固定版本 |
| update_element | elementId, name?, description? | 不修改已有版本身份 |
| add_element_version | elementId, versionId, assetId | 追加，不自动设当前 |
| set_element_current | elementId, versionId | 改当前指针，不改 Canvas 或生成 |
| remove_element | elementId | 有活跃绑定则拒绝并返回使用者；否则软删除 |
| restore_element | elementId | 恢复入口，保留历史版本 |

整批完成后再校验最终状态，并在一个事务提交。删除文件夹的预览为只读查询，包含
organizationRevision、父级、受影响 Asset/子目录与名称冲突；apply 必须对应同一 revision。
创建对象的重复 ID 只有内容一致才可幂等 no-op，不得静默覆盖不同对象。

## 3. canvas.apply 扩展

仍使用 Canvas expectedRevision；原媒体/文字操作兼容，但必须维护新组织不变量。

| operation | 关键字段 | 行为 |
|---|---|---|
| create_group | groupId, name, role, memberCardIds, summaryFrame, expandedFrame | 新建扁平组 |
| update_group | groupId, name?, role?, resultCardId? | 展示语义，不代表接受结果 |
| set_group_members | groupId, memberCardIds | 最终状态一节点至多一组；可在一批内换组 |
| set_group_collapsed | groupId, collapsed | 不修改成员 canonical frames |
| move_group | groupId, deltaX, deltaY | 原子平移组框与所有成员绝对坐标 |
| resize_group | groupId, target=summary\|expanded, frame | 只改组框，不缩放或移动成员；展开框不能小于成员包围框 |
| remove_group | groupId | 明确解除，不递归删卡 |
| set_organization_view | historyMode?, referenceMode? | 改持久化显示偏好 |
| bind_element | bindingId, consumerCardId, elementId, versionId, referenceCardId, order, role | 校验并冻结精确 Asset，必要时建立真实 Asset 卡 |
| unbind_element | bindingId | 解除该绑定及指定输入位置，不删源素材 |
| review_element_binding | bindingId, observedCurrentVersionId, decision=keep\|adopt | keep 保留旧输入；adopt 显式绑定所观察当前版本 |
| bind_template_slot | instanceId, slotId, binding | 绑定目标项目 Asset 或 Element 固定版本 |
| unbind_template_slot | instanceId, slotId | 移除该槽引用并恢复未完成状态 |
| detach_template_instance | instanceId | 用户明确解除模板关联，保留真实节点及输入 |

bindings、实际 referenceCardIds 和 Asset 卡在一条命令中保持一致；不得伪改历史
generationSnapshot。绑定 Element 与删除检查都通过事务化组织 helper 验证。
用户观察到的 current 已变化时，review 操作返回冲突，不能悄悄采用另一个新版本。
原 remove_card 还须原子清除成员/resultCardId、相关绑定和实例 step/slot 映射；
输入节点被删除后的必填槽回到 unbound。删除展示卡不删除源 Asset 或历史任务。

## 4. workflow.template.*

模板库属于本机安装；命令仍有当前项目上下文用于来源检查与 receipt，不创建第二项目服务。

| command | 前置版本 | 内容 |
|---|---|---|
| workflow.template.capture | expectedRevision=0（新模板），sourceCanvasRevision | templateId, name, selectedCardIds；后端按白名单捕获 |
| workflow.template.rename | expectedRevision=模板 revision | templateId, name |
| workflow.template.remove | expectedRevision=模板 revision | templateId；不删实例 |
| workflow.template.instantiate | expectedRevision=目标 Canvas revision | templateId, templateRevision, instanceId, bindings, placement |

v1 保存为新模板，不实现覆盖旧定义的编辑器；如需修改，先实例化再另存。
模板预览同时返回 definitionDigest；capture 写入应带该 digest 复核与 sourceCanvasRevision，
防止用户看到的步骤与实际保存不一致。rename 只改变元信息并递增模板 revision。

instantiate 事务中核对明确 templateRevision、目标项目绑定、卡片数和文档大小；
写 Canvas、实例元数据和 receipt。ID 由稳定请求标识与局部 stepId 派生。
未绑定必填槽允许创建可编辑草稿，返回 blockers；不实例化为假的 asset 卡。
删除/改名模板不会破坏实例已经保存的定义摘要、配置与冻结槽要求。

实例化只查模型 catalog，未知模型返回可编辑警告。不能调用要求 provider 已配置的完整
生成 preflight，更不能创建 upload intent 或生成 job。

## 5. 只读查询

| UI query | 关键输入/输出 |
|---|---|
| GET /api/app/projects/:id/organization | document + organizationRevision，未初始化为空 0，不写库 |
| GET /api/app/projects/:id/organization-preview | 明确 operation 与 folderId/elementId；影响、冲突及相关 revision |
| GET /api/app/projects/:id/assets | 新 GET；folderId、scope、query、cursor、limit → 去重 assets + nextCursor + revision |
| GET /api/app/projects/:id/timeline-usage | timelineRevision、真实使用片段、采用来源与候选来源区分 |
| GET /api/app/workflow-templates | 模板摘要列表 + ETag，支持可见面板条件刷新 |
| GET /api/app/workflow-templates/:templateId | 定义、revision 和 definitionDigest |
| POST /api/app/projects/:id/template-preview | 只读 capture/instantiate 影响预览，不产生状态 |
| GET /api/app/projects/:id/revision | 原 canvas/timeline 加 organization；版本不存在语义保持原约定 |

Asset 查询：省略 folderId 且 scope=project 为全项目；scope=current 且 folderId=null
表示未分类，传具体 ID 表示该层，不隐式包含子目录。query 匹配文件名/现有显示名，
结果包含路径线索。按 createdAt/id 的稳定顺序分页，cursor 绑定筛选参数和组织 revision；
期间目录变化返回需重新查询，不能沿旧 cursor 跳过或重复归类结果。结果先去重再分页。
现有上传 POST 不变；既有 recent-assets 兼容面仍可使用，目录页不能只过滤它的有限结果。

Timeline usage 调用 getTimelineClipSource：activeTake 的区间遵循当前 helper，不能拿原 clip
inPoint 冒充 take 区间。提供 trackId/clipId、sourceType、实际 Asset/take、timelineStart、
duration、sourceIn/sourceOut、hidden/muted。字幕无媒体 Asset，独立列出；没有时间线返回空
列表和 null revision，不创建 Timeline。

## 6. MCP 对齐

- 继续 `bdesign_canvas_get` / `bdesign_canvas_apply`，读写 v4 组织信息和新增语义操作。
- 新 `bdesign_organization_get`（可选影响预览）、`bdesign_organization_apply`。
- 新 `bdesign_asset_query` 返回分页 envelope；原 `bdesign_asset_list` 保持数组返回形状，
  委托相同去重服务，原 limit 仍有效，避免破坏已有制作脚本。
- 新 `bdesign_workflow_template_list/get/preview/apply`：apply 分发上文严格命令，不直接写库。
- 新 `bdesign_timeline_usage` 使用与 UI 相同的只读服务。
- 生成工具数量、能力和 provider 路由不因上述工具存在而改变。
- 活跃项目解析、workspace handoff 和错误 envelope 复用现有约定；工具支持不冒充运行验证。

## 7. 成功、冲突与重试

- 复用 ok/commandId/projectId/origin/changedIds/warnings/revision/data envelope。
- data 按需包含 canvas、organization、templateSummary、instanceIds、blockers、相关 revisions。
- 复用 INVALID_COMMAND、NOT_FOUND、REVISION_CONFLICT、COMMAND_FAILED；对机器可处理的
  具体原因可在 data/errorDetails 扩展严格 discriminated code，并保留旧 message。
- revision 冲突带最新相关版本，不自动采用新值重放覆盖。新命令同键、不同指纹拒绝。
- 新命令与含新增操作的 batch 必须退出既有自动换 revision 的 Canvas 重试包装器；
  明确复核后再以新 ID/key 和前置版本提交。legacy-only 独立操作仍沿用原有有界重试。
- 同键同内容并发/断线重试返回同结果；状态保存和 receipt 同事务。崩溃不会只留下其中一半。
- 旧无指纹 receipt 与新操作碰撞时明确要求新 commandId/key；不假称已验证 payload 一致。
- 节点/模板/目录等超限在提交前整批拒绝，无部分文件、卡片或绑定遗留。
- 所有 v4 snapshot 保存路径，包括旧卡片操作、UI replacement、undo/restore、系统生成结果
  同步和重试，都须在事务内重验最终组织绑定并做 Canvas CAS；不能绕过 Element 删除检查。

## 8. 生成边界

既有 Canvas 节点的生成在 UI preflight、最终 submit 和 MCP 中都必须提供 sourceCardId；
缺失明确拒绝，不能把模板节点的缺槽状态当作独立文本生成。来源 ID、已审核配置和绑定摘要
写入 intent 并在 submit 复核。Standalone Studio/legacy 新生成可以没有 Canvas 来源，
但不得以该请求产生的结果冒充对既有模板节点的提交或附着。
生成前服务端以项目和 sourceCardId 读取当前模板实例、固定 Element 绑定，核对必填槽、
真实 Asset、版本、用途、顺序与模型能力；preflight 和最终 submit 都检查，以防两者间变更。
旧请求不带 Element 扩展来源字段仍兼容；这不豁免 Canvas 节点的来源标识。
绑定/配置在 preflight 后变化使原生成 intent 失效或被明确拒绝，用户重新检查后提交。
生成时把精确 Element 版本与绑定信息写入既有 input/provenance；仅画连线不是送达证明。

## 9. 实现前契约回归

以上读/写接口需有严格 schema 和正反例：未知字段、跨项目媒体、循环组/目录、
旧 revision、同键异内容、缺显式 envelope、缺 Canvas sourceCardId、配置/绑定变更后的
旧 intent、缺槽、不可用模型、旧客户端 replacement、activeTake 和边界大小。
所有组织/模板测试必须断言 provider/upload/job 调用计数为零。
