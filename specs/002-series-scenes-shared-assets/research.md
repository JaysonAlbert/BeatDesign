# Research: 分集导航、分场画布与共享参考
日期：2026-10-20。只读研究；所有新增行为均为设计，未实现。

## 证据及可信边界

| 来源 | 本次使用的事实 | 不能推断 |
|---|---|---|
| [Higgsfield Cinema Studio 官方帮助](https://higgsfield.ai/creator-hub/help-center/tools/how-do-i-use-cinema-studio)，本日重新读取 | 3.5 的 Elements 为项目级角色/地点/道具，可从其他项目取用；项目风格与逐镜设置分开 | 没有实测跨项目绑定事务、版本固定或多集导航 |
| [官方模板采集档案](../../docs/references/higgsfield/2026-10-20-official-workflow-resources/README.md) | LongVideoExample 共享参考向多个生成段分发；StoryBoardWithElements 按 ASSETS/STORY/PROMPTS/IMG/VIDEO GEN 分区 | 不证明独立场次文档或完整连续剧管理 |
| [LibTV 素材板与结果浏览档案](../../docs/references/liblib/2026-10-20-complex-workflows/README.md) | 同一公开作品可切工作流/分类素材板；媒体与用途类别并存；节点内 2/2 浏览及隐藏无关线 | “故事板”不等于剪辑时间线；2/2 不证明历史版本；样本素材数不等于镜头数 |
| 当前工作树源码，基线 a7d57c1 | 下表约束 | 分支已实现不等于主线已发布 |

截图继续复用项目引用资源，无新交互式浏览器操作，无新增截图或登录信息。未复制账号、真实影片、提示词或媒体进入本设计。官方帮助支持“跨项目复用”方向，本项目的版本及归属策略为自己的设计。

## 当前代码约束

- `src/config/db/schema.sqlite.ts:233–337`：Canvas、Timeline、Organization 按 projectId 单份保存。
- `src/core/projects/project-snapshot.ts:8–10`：200 cards、2 MiB 是保存限制，不只是可视化阈值。
- `src/core/organization/canvas-organization.ts:40–177`：组扁平、最多 64 个、单卡至多一组。
- `src/core/organization/organization-document.ts:19–53`：Elements 项目级，图像/音频版本。
- `src/config/db/schema.sqlite.ts:56–98,353–383`：全局 Asset 与项目 membership 分离，可复用文件。
- `src/core/commands/asset-boundary.ts:10–32`、`src/core/organization/service.ts:177–313`：素材和 Element 绑定当前 Project，不能直接塞其他集 ID。
- `src/core/workspace-lib/assets/user-assets.ts:303–370`：membership 可幂等链接；:174–176 的全局删除不能用于“移出素材板”。
- `src/core/organization/generation-source.ts:204–236,356–384`：生成来源指纹冻结实际输入与版本；需补 canvasId。
- `src/core/projects/project-revision.ts:10–37`：仅项目默认 Canvas revision，需扩展文档维度。
- `src/core/commands/contracts.ts:3–9`：现有 envelope 以 Project 为域；Series 不能假借某一集保存回执。
- `src/components/app/product-page-shell.tsx:153–190` 与 `src/routes/canvas/$projectId.tsx:8–15`：工作区仅 projectId，Canvas focus 已存在，尚无完整场次上下文。
- `src/components/beatcanvas/organization-panel.tsx:223–237`：现有定位会展开持久化组；新导航需只读临时显示。
- `src/core/organization/service.ts:52–150`：Assets 已有 membership 过滤及游标分页，可扩用，不建第二套媒体后端。
- `docs/DESIGN.md`：56px 顶栏、全幅画布，可收起导航/窄屏抽屉、键盘及触控目标。

以上来自根代理源码检查及 Spec Kit Phase 0 两个只读研究任务：数据归属和导航/素材板。研究代理未写文件或改变运行态。

## D1 — Series 聚合现有 Project，每个 Project 是一集

**Decision**：新增 Series/Episode 关联；独立 Project 无需入剧集也可有场次。一项目最多属于一个 Series，每集沿用自己的 Assets/History/Timeline。
**Rationale**：保留同项目四工作区和素材边界；不把整季压入一条时间线。
**Alternatives considered**：一个 Project 存整季会让现有 Timeline 语义不明；每场隐藏 Project 令资产流转和集剪辑复杂；只用命名文件夹无法表达集顺序、导航、共享范围。均不采用。

## D2 — 场次导航必须配独立 Canvas document

**Decision**：Scene 属于 Project；每场有一至多张 Canvas documents，单文档仍 200 卡/2 MiB、64 组。旧内容留在默认项目画布。
**Rationale**：只做 Scene 筛选仍无法保存 600 卡的一集。此次先设计，能把必要的数据身份扩展明确纳入范围。
**Alternatives considered**：仅筛选是小而兼容的先行版本，但不能作为本方案“长视频容量已解决”的完成条件；无限提高卡片上限会持续增加加载和连线负担；用组伪装文档不提供真正分区。
**Trade-off**：比单加导航显著扩大底层工作，须扩 command/source intent/revision/autosave/URL/模板。后续可分交付批次，但单独侧栏不可宣称 002 完成。

## D3 — 默认文档保留旧存储，非默认文档使用新表

**Decision**：新文档表登记文档身份与元信息；默认条目指向原 project_canvas_state，场次文档保存各自快照。读取通过统一 repository，不双写同一快照。
**Rationale**：旧 URL/MCP 省略 canvasId 时只访问默认文档，旧快照原地保留。默认画布可明确归属某场，但不能删除或替换其稳定 ID。
**Alternatives considered**：一次搬走所有旧快照需大范围迁移与回滚；把多文档塞进单快照仍受总限制。默认适配器是明确兼容层，今后统一存储另案。

## D4 — 共享身份与可用媒体分层

**Decision**：SeriesAssetMembership 管共享素材板；SeriesElement/Version 管权威身份。使用时同事务建立目标 Project 的 Asset membership，并记录来源；文件不复制。
**Rationale**：既有生成、媒体路由、Timeline 继续只接受本项目具备归属的 Asset。
**Alternatives considered**：放宽所有 foreign asset 校验会越界；各集复制 Element 会产生多个权威身份；挪动原文件会破坏来源路径。
**Boundary**：共享浏览走 membership 检查的 Series 只读媒体路由；用于本集时才授予项目 membership。仅凭 URL 不赋权。

## D5 — 固定版本、只显式采用

**Decision**：绑定使用 scope/ownerId/elementId/versionId/assetId；新版本只发可升级提示。更新预览覆盖选中的精确消费者，整批 CAS 后一次采用。
**Rationale**：保留既有输入、历史、旧 take、剪辑，避免母版更新造成全剧漂移。
**Alternatives considered**：自动跟随 currentVersion 不可复现；后台逐集更新可能部分成功且难解释。首期批次有界，跨批不承诺全季原子更新。

## D6 — 素材板扩展 Assets，而不是新增后端

**Decision**：范围（本场/本集/共享）与类别（媒体/人物/场景/道具/声音）分开；逻辑文件夹、Element 身份、场次归属三者正交。
**Rationale**：借鉴 LibTV 的找素材/看网络切换，用同一 Asset 和 Timeline 实际采用数据。
**Alternatives considered**：“素材板即最终分镜”会混淆候选与采用；所有素材转节点造成网络膨胀。均不采用。

## D7 — Scene 与剪辑只有显式关系

**Decision**：可选 SceneClipLink 标记已有 clip；不改变 clipId、Asset、source range、轨道或播放顺序。未标记是“未归场”，不能猜测。
**Rationale**：一个素材可能复用在多处，不能仅按 Asset 推导场次；组的结果也不表示人工通过。
**Alternatives considered**：按场次排序重写时间线、按组名自动判断采用都破坏真实剪辑。

## D8 — 同一个 Command Kernel，增加真正的 Series 域

**Decision**：Project 命令带可选 canvasId；Series 命令独立 scope/receipt，仍复用内核、校验、事务、错误和请求哈希机制。多资源写显式 revision 向量。
**Rationale**：Series 不是某一集，不能将回执存在任意 projectId。SQLite 事务可覆盖有界多文档更新。
**Alternatives considered**：UI 独立写库、MCP 二套服务、前端循环分集写入均不满足归属/幂等/原子性。

## D9 — 导航只读，整理显式写

**Decision**：路由验证 project/series/scene/canvas 关系；切换前保存并卸载旧订阅；定位临时展开可见投影，返回恢复原显示，不落库。
**Rationale**：浏览不能改变镜头整理状态；异步回包须按 projectId+canvasId 隔离。
**Alternatives considered**：复用当前 focus 的持久化展开会把导航变成写操作；每次进入场次自动整理导致人工布局丢失。

## 研究结论

所有技术待定项已形成可审阅的默认决策，无待澄清占位。性能、容量和 UI 可用性目标尚待实现后测量；本文件不作为这些目标已通过的证据。无团队、云服务或生成模型变更。
