# Data Model: Series / Scene / Canvas / Shared Assets
状态：拟议模型，尚未新增表或升级数据库。名称为逻辑约定，实现阶段可统一命名但不得改变不变量。

## 1. 关系与身份

```text
Series ──< SeriesEpisode >── Project（既有分集项目，最多一个剧集）
  │                            ├──< Scene ──< CanvasDocument ──< Shot group / Cards
  │                            ├── 默认 CanvasDocument（旧项目画布）
  │                            ├── Timeline（仍一份）──< Clip
  │                            └── Project Asset membership
  ├──< Series Asset membership >── Asset（既有全局媒体）
  └──< SeriesElement ──< Immutable Version >── Asset
                                  ↑
                    exact Canvas binding / template slot
```

Scene 属于 Project，不依赖 Episode 行存在，独立单片也能分场。Element 的 location 与叙事 Scene 无主从关系。Canvas group 是扁平镜头/制作组织单位，不等于 Scene；一个文档可以有多个组。

## 2. 拟增实体与字段

| 实体/建议表 | 主要字段 | 不变量及版本域 |
|---|---|---|
| series | id, name, description, revision, createdAt, updatedAt, archivedAt | 本机稳定 UUID；名称 1–120 字；摘要 ≤1,000 字；每次组织/共享库变更递增 series revision |
| series_episode | id, seriesId, projectId UNIQUE, label, orderKey, createdAt | Project 是内容权威；label 可选 ≤120 字；按 orderKey+id 稳定排序；一 Project 最多一个归属 |
| project_scene | id, projectId, name, summary, orderKey, archivedAt | 名称 1–120、摘要 ≤2,000；同名允许；受 project narrative revision 保护 |
| project_narrative_state | projectId PK, revision | 场次/画布目录/场次归类/clip 标签的元数据版本，初始 0；不混入 Organization revision |
| project_canvas_document | id, projectId, sceneId nullable, name, orderKey, storageKind, document nullable, version nullable, archivedAt | storageKind=legacy_default 时不存 document/version，转发原表；否则使用独立 snapshot/CAS；目录改动用 narrative revision |
| series_asset_membership | seriesId, assetId, sourceProjectId, publishedAt, archivedAt, provenance | UNIQUE(seriesId,assetId)；复用真实 Asset；来源项目非生命周期所有者 |
| series_element | id, seriesId, kind, name, description, currentVersionId, archivedAt | kind=character/location/prop/voice；当前推荐指针必须属于自身；series revision 管理 |
| series_element_version | id, elementId, assetId, ordinal, sourceProjectId, sourceElementId?, sourceVersionId?, createdAt, note | 版本行不可变；图像/音频且类型符合既有规则；追加新版本，不替换 Asset |
| series_reference_consumer | seriesId, elementId, versionId, projectId, canvasId, bindingId, consumerCardId, slotId? | 物化使用索引；从权威 binding 同事务维护；不可作为生成输入权威；唯一消费者定位 |
| project_asset_scene | projectId, sceneId, assetId, provenance | UNIQUE(sceneId,assetId)；显式场次归属；Asset 须有本项目 membership |
| project_scene_clip | projectId, sceneId, clipId | 同集 clip 至多一个叙事场次；一个素材可对应多个 clip，分别归场；删除 clip 同事务删标签 |
| project_canvas_card_locator | projectId, cardId, canvasId, previousCanvasIds | 项目内卡身份唯一；转移时维护当前去向及有界历史位置，历史生成来源不改；删除后保留 tombstone，不复用 cardId |
| series_command_receipt | seriesId, idempotencyKey, commandId, requestHash, result, createdAt | 主键(seriesId,idempotencyKey)，复用既有有界回执保留规则；不是永久审计 |

项目原表、project_asset_membership、project_organization_state、workflow_template、generation_history 不复制。共享版本和来源记录长期保留，不能仅依赖会过期的 receipt。

索引至少覆盖：series_episode(seriesId,orderKey,id)、project_scene(projectId,orderKey,id)、canvas(projectId,sceneId,orderKey,id)、共享类别/归档查询、consumer(elementId,versionId)、consumer(projectId,canvasId)、scene assets(sceneId,assetId)、clip(sceneId,clipId)。服务分页前限制范围，不先读全库。

## 3. 默认画布与场次文档

- 每 Project 恰有一个不可删除的默认文档。id 由 projectId 确定性派生，服务目录登记；省略 canvasId 只解析它，不猜“最近打开”。
- 默认文档快照和 revision 唯一存于旧 project_canvas_state；新目录行只描述身份、场次归属和名称，无第二份正文。
- 非默认文档存 project_canvas_document.document/version；相同 repository 接口返回统一 {projectId,canvasId,sceneId,document,revision,narrativeRevision}。
- 任意文档只属于同 Project 一个 Scene 或 sceneId=null（未归场），同 Scene 可有多文档；修改归属不改节点或历史。
- Canvas v5 扩展绑定 scope；读取 v1–v4 时内存归一化为 project scope。只有实际显式写入时保存新版本。不得仅因浏览重写旧正文。
- 默认目录登记可以在明确授权的数据库升级中按幂等步骤建立，不能在 GET 中偷偷迁移；缺目录时只读适配器可派生默认项，首个写命令在事务内登记。
- 旧客户端省略 canvasId 只处理默认文档。对无法理解的新 schema、scoped binding 或非默认文档写入，返回能力错误，不裁掉新字段继续保存。
- 每文档 200 cards、2 MiB、64 groups、原有单卡参考上限保持；每场最多 10 文档、每 Project 最多 500 文档（含默认）、200 场；每 Series 最多 100 集。达到任一上限整次拒绝，保留内容。SC 的 12 集×20 场在范围内；这些新目录上限为设计值，需实施前压力验证。
- 单文档超限通过显式新建另一画布分区，不自动搬迁；跨文档无 card edge/textCardId，媒体通过 Asset/Element 实际引用。

## 4. Scoped binding 与来源

统一规范引用：
```text
{ scope: project|series, ownerId, elementId, versionId, assetId }
consumer = { projectId, canvasId, bindingId, consumerCardId, referenceCardId, order, role }
```

project scope ownerId 必须等于目标 Project。series scope 必须是该 Project 当前所属 Series，版本属于身份且 Asset 在共享库，目标 Project 存在 reference membership。模板槽采用同一 resolver；可移植模板不携带裸 seriesId/assetId 的自动授权，实例化前显式选择目标范围内的固定版本。

生成 precheck/intent/submission/sourceDigest 新增 canvasId，并冻结该文档实际卡片/配置、scoped binding、版本与 Asset 顺序。旧请求省略 canvasId 解析默认文档；另一场同名/同 ID 卡片不能替代。更新引用、转移节点或归档文档使相关旧 intent 失效，必须重新 precheck。已运行作业按原冻结输入完成，不取消、不转移其历史来源。

全局 Asset 的 objectKey 不搬；原项目 ID 作为 provenance 保留。Series 只读媒体路由检查 series membership；项目播放/生成路径检查项目 membership 并由服务返回正确地址，不直接复用含来源 projectId 的字符串。

## 5. 素材板与采用查询

- 本集：既有 project_asset_membership。
- 本场：显式 project_asset_scene 与该场 Canvas 中实际引用/输出素材去重并集；返回 provenance。历史输入精确记录，未归场单列，不反推。
- 共享：当前 Series 活跃成员，按 Element 类别及媒体类型筛选；归档内容只有历史详情或明确“含归档”可见。
- 使用数量按消费者、clip 分开返回；不能把一个媒体多次引用当多份素材。
- Timeline adoption 从真实 clip/take 与 SceneClipLink 派生；无 clip 标签不猜场次。修改 clip 内容/删除标签须同时检查 Timeline 与 narrative revision。
- 查询响应包含 revision token、nextCursor、loaded/total（total 未计算时明确 unknown）。不把第一页长度当总量；revision 变化使 cursor 失效并可重新分页。

## 6. 共享生命周期与删除

1. publish：校验源项目当前 membership，Series/源项目关系合法；建立共享 membership，版本冻结 Asset 与来源。
2. bind/use：当前集属于 Series；事务内添加目标 membership、精确 binding、consumer 索引。
3. add_version / set_current：只追加或改变推荐指针；旧绑定不动。
4. review/keep：记录 observedCurrentVersionId 已审阅，固定旧版不变；下次出现更新才重新提示。
5. adopt：新版本可用且预览仍一致，目标 revision 全部匹配后同事务写所选消费者。若同一参考卡还被未选步骤使用，为选定输入建立新 Asset 引用卡并只替换其 referenceCardIds/槽；不得就地覆盖共用参考卡而让未选消费者漂移。新卡容量计入预览，稳定 ID 保证重试不重复。
6. archive：默认隐藏、禁止新使用；历史已有 pin 可读。解除归档恢复发现入口。
7. detach_episode：提供引用/共享输出清单；同事务将该集仍存在的共享绑定物化为 project Element 固定版本并替换活跃绑定（原 source scope 保留来源，历史不改），保持 Asset membership。生成源变更使未提交 intent 失效。超出批次/事务上限则拒绝，先在仍归属时分批显式本地化，不能半脱离。不删 Series 已发布内容。
8. 归档 Series 不自动 detach 所有集，仅停止新共享发布和绑定，保留旧引用；恢复后可继续。
9. 任何文件级删除必须检查所有项目 membership、共享版本、Canvas、生成历史、Timeline；在用则拒绝并列消费者。移出目录/共享库不调用全局 deleteUserAssetById。
10. 分集项目删除：存在 series_episode 关联或共享来源/消费者时拒绝硬删除，先完成预览及显式解除流程；归档项目允许且不级联删媒体。

## 7. 转移画布内容

仅支持同 Project 的两个活跃文档。preview 返回依赖闭包（所有 reference cards、text refs、bindings、模板实例 step/slot、组成员）、源/目标 revision、相关 intent 状态、目标容量、稳定映射、摘要。
- 活跃待提交 intent 或运行任务所用源卡阻塞转移；先完成/取消原 intent，运行任务完成后再操作，不自动取消任务。
- 引用闭包不完整、模板实例被拆断、跨文档文本依赖或未知操作阻塞；可选把依赖也加入预览，不能默默断边。
- apply 在一个事务中转移卡片/组/绑定与消费者位置，保留稳定 card ID、Generation/Asset/history ID；检查全项目无 card ID 冲突。
- 历史生成来源仍记录原 canvasId，不重写；使用 provenance/locator 映射原位置到当前位置，旧深链可提示“已移动”。删除原文档不能删来源映射。
- 对外 Canvas 去重按 projectId+canvasId+cardId；历史定位额外跟踪迁移映射。不支持跨项目移动画布，跨集只使用已发布资产。

## 8. 事务与并发

Series 内容用 series revision；集元数据用 narrative revision；每 Canvas 用自己的 revision；Timeline/Organization 保持原域。复合写携带所读资源的 revision 向量，失败不写任何域或 receipt 成功记录；回执与实际写同事务提交。已成功同哈希重放返回原结果，即使 revision 已前进；同幂等键不同请求拒绝。清理索引不改变权威文档，需可重建且有一致性检查。
