# Implementation Plan: 分集、场次导航与跨集共享资产

**Branch**: `codex/canvas-project-organization` | **Date**: 2026-10-20 | **Spec**: [spec.md](spec.md)
**Feature directory**: `specs/002-series-scenes-shared-assets`
**Status**: Phase 0 research / Phase 1 design complete as drafts; pending user review. No tasks or implementation.

## Summary

采用三层范围：**Series 聚合多个现有 Project，每集是一个 Project；Scene 是集内叙事段落，拥有独立 Canvas documents；各集使用固定版本的剧集共享资产。** 每集继续自己的素材、历史和一条 Timeline，单片无需建立 Series。

Higgsfield 参考项目与 Elements 的身份复用；LibTV 参考分类素材板和节点内结果浏览。[研究及证据](research.md) 区分实测、官方文档与本项目提案；不把“多集导航”说成竞品已核实能力。

这次设计包含真正的画布分区。当前每 Project 一张 Canvas 且上限 200 卡，单加场次筛选无法支撑一集数百节点。不能把这项底层扩展伪装成侧栏小改动，亦不提高单文档上限。

## 授权与阶段

用户原话见 spec。授权同时产出需求和技术设计供审阅，不是新需求/方案的正式批准。既有 workflow 的 review-spec/review-plan 在本轮以联合设计稿待审方式呈现；001 的批准不延伸到 002。本轮到 Phase 1 停止，没有 tasks.md、应用代码、迁移、影片变更、生成、合入或部署。

依赖 001 尚未合入的组织实现，研究基线 a7d57c1；当前 530/22 的历史测试结果只属于 001，不能证明 002。setup-plan 输出的 BRANCH=002-series-scenes-shared-assets 是 feature resolver 的逻辑特性名；实际 Git 分支如页首，独立目录不等于另建分支。

## Technical Context

**Language/Version**: TypeScript 5.9、Node >=22、React19；沿用项目锁文件。
**Primary Dependencies**: TanStack Start/Router/Query、React Flow12、Zod4、Drizzle；不新增框架。
**Storage**: 原本机 SQLite + Asset 文件；增量表、默认 Canvas 适配器、固定版本共享索引。
**Testing**: 既有 Node test runner、Playwright、类型、多语言及生产构建；新增文档归属/并发/升级/生成来源回归。
**Target Platform**: 本地 Windows 浏览器为当前验证主环境；中英文与窄屏；既有本地发行架构保持。
**Project Type**: 本地优先创作工作台与同服务 MCP。
**Performance Goals**: SC-001–006；2秒场次切换、1秒筛选的本地热缓存 p95 目标，尚未实测；按 query/read 和媒体传输分别测量。
**Constraints**: 同一集同一 Project、资产归属、明确 command/CAS/幂等、零整理触发生成、单文档200卡/2MiB、64组；不读全剧集快照。
**Scale/Scope**: 设计容量100集/Series，200场/Project、500文档/Project、10文档/Scene，分页默认100上限500；验收12集×20场、6,000卡、2,000素材。上述容量是待压力验证的新设计上限，不代表当前已支持。
**Resolved Research**: 九项决策均已形成明确默认方案，见 research.md；无未解决技术占位。用户可在审阅时调整范围。

## Constitution Check

| 原则 | Phase 0 前检查 | Phase 1 后设计检查 |
|---|---|---|
| I 同 Project 四工作区 | 每集复用既有 Project；Series 仅集合 | 场次 Canvas 属该集，Assets/Timeline 无第二后端；符合 |
| II 确切 Asset/版本 | 共享不绕项目边界 | 版本不可变，使用时授予 membership，clip不跟随新版；符合 |
| III 共享 Command Kernel | 需增加 Series 域及画布ID | 同内核、独立 scope receipt、revision向量、有界事务；符合 |
| IV 整理与生成分开 | 浏览/共享不是生成 | source intent精确绑定文档；所有新整理操作零提交/上传；符合 |
| V 声明与证据一致 | 竞品/实现/验收分开 | 此次仅文档检查；性能、UI、运行、迁移都未验；符合 |

无原则例外。Series receipt 是现有内核的 scope 扩展，不是第二业务后端；默认画布兼容适配器是有意保留的单一快照读写位置。

## Project Structure

### Documentation (this feature)

```text
specs/002-series-scenes-shared-assets/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/
│   ├── commands.md
│   └── ui.md
├── quickstart.md
└── checklists/
    ├── requirements.md
    └── design-review.md
```

不生成 tasks.md；待需求/技术方案审阅后才进入任务拆解。

### Source Code（拟改动，均未实施）

```text
src/config/db/schema.sqlite.ts           # 源schema；schema.ts由既有脚本生成
src/core/db/sqlite.ts                    # Web/MCP共用增量本机升级
src/core/series/                         # 新Series服务/引用/消费者查询
src/core/projects/                      # Canvas document repository、目录、revision
src/core/organization/                  # scoped Element resolver/模板/来源
src/core/commands/                       # envelope/schema/persist/receipt/CAS向量
src/core/editor/                         # SceneClipLink校验和定位，不改片段绑定语义
src/components/app/                     # 顶部上下文、导航、素材板
src/components/beatcanvas/               # 按canvasId持久化/定位/独立undo
src/components/editor/                  # 场次定位与标签，不裁剪本集时间线
src/routes/                             # series总览、扩scope、commands/queries/media
scripts/mcp-server.ts                    # 注册同服务语义工具及capability
scripts/ + tests/                       # 合成fixture与隔离验收，沿用既有布局
```

**Structure Decision**：复用当前单仓库，文档、媒体、模板、生成及剪辑的服务边界不另建。所有 mutation 都进入共享内核；新读接口只提供受控范围。

## Phase 0 — Research decisions

1. Series → Episode Project，保留旧单片。
2. Scene → 独立 Canvas documents，不仅前端过滤。
3. 默认文档仍读写 project_canvas_state；新文档用新表，唯一正文权威。
4. Series 素材归属与身份版本分层；使用时建立目标项目归属。
5. 推荐新版与消费者固定版分开，显式有界原子采用。
6. 素材板扩展现有 Assets，媒体/用途/范围正交。
7. Scene 与 clip 显式关联，不推断或改剪辑顺序。
8. 同内核增加 Series scope 和多资源版本向量。
9. 导航临时投影只读，整理显式写。

两个 Spec Kit 只读研究任务核对数据/导航边界，已综合其约束。其“只做Scene筛选”的较小备选被保留为可能的先行批次，但因仍受整集200卡限制，不满足本方案的最终容量目标。

## Phase 1 — Architecture and behavior

### A. 导航与工作区

Series总览和可收起上下文导航把用户带到某集某场某画布；URL是稳定ID，排序/重名不改变身份。切换工作区保留合法范围，Editor仍完整展示本集剪辑，仅高亮/定位场次片段。切场前完成当前保存；冲突保留草稿。缓存、polling、upload placement、undo以 projectId+canvasId 隔离。

### B. 文档与生成来源贯通

统一 repository 解析默认/场次文档；read/get/revision、canvas.apply、snapshot兼容、模板捕获/实例化、undo、MCP、修复工具、预检/intent/submit、结果定位都必须携带实际文档身份。旧工具省略仅默认，不猜会话范围。

Canvas v5规范scope引用，旧v1–v4在内存适配。服务拒绝旧客户端裁掉新字段的写入，提供capability协商。生成输入digest含canvasId和确切版本；更新输入使未提交intent失效。已运行任务保留原来源与结果所属项目，不因用户切场改变落点。

不支持跨文档card/text边。需要共用的媒体使用Asset/Element引用，不能把另场文本卡ID当可解析输入。

### C. 共享库与版本

Series发布存唯一权威身份及不可变版本；Asset文件仍原地。只读共享媒体路由检验Series membership；绑定/用于本集时同事务给项目membership并存来源。素材库查范围，不能仅凭其他项目URL读取或生成。

发布/推荐不修改消费者。采用先预览，选择确切步骤/槽，校验Series和全部目标文档revision，原子更新选定未来输入。历史、clip、模板实例原始来源不变。消费者索引同事务维护，可校验重建；生成只信权威binding而非索引。

归档保留历史可读。移出分集需预览和显式本地化现有共享引用，不允许半脱离；Series原版本继续存在。全局删除必须检查跨项目/共享/历史/剪辑使用。

### D. 素材板

沿用 Assets 服务分页，增加本场/本集/共享和媒体/参考类别/用途。显示批次结果与历史take不同维度，固定版本与推荐版不同维度，Timeline使用由真实clip/take及显式场次标签派生。旧结果定位不替换当前采用。总量未知明确显示，不伪报第一页数量。

### E. 内容转移与兼容

预览只读；转移仅同Project，依赖闭包完整且没有被运行任务/待提交intent占用的源卡。源目标snapshot、绑定、组、模板和locator一次事务更新；超容量/冲突整批回滚。Generation历史位置仍不可变，locator给出当前去向。默认项目画布永远可达。

不自动拆真实项目；旧项目打开不改变正文、媒体和封面。未来数据库结构升级只在隔离库验证，正式升级与逐片内容迁移分别授权；本轮两者都不执行。

## Delivery sequencing（仅依赖顺序，不是 tasks）

- **A 基础身份与兼容**：画布目录/repository、revision、source intent、capability和旧客户端保护先贯通，再开放场次文档UI。否则禁止暴露“多画布可写”。
- **B 叙事导航**：Series/集关系、单片场次、URL/四工作区、隔离undo与只读定位。
- **C 共享版本**：共享目录、membership、绑定/模板resolver、消费者预览与原子采用/脱离。
- **D 素材板及整体验收**：分页、分类、批次/历史/采用详情，合成大作品压力测试与中英文浏览器/MCP联动。

每批独立可评审，但仅B不算完成长作品组织。具体任务、提交拆分、验收样例由审批后的 tasks 阶段产生。

## Verification and migration strategy

完整操作见 [quickstart.md](quickstart.md)。覆盖：
- 旧URL与默认文档、v1–v4、旧MCP、无自动回写；
- 多文档跨场、保存竞态、切换后旧请求回包、undo隔离；
- 错canvasId的precheck/上传/submit、运行结果回到原Project；
- 20引用固定v1/3个采用v2/冲突0更新，双进程binding与detach/archive竞争；
- 600卡分6场真实分区、6,000卡剧集不全量读、2,000素材分页；
- 在用删除、缺媒体、模板越界、跨Series拒绝；
- 每类组织操作生成/上传计数0，旧媒体hash、history、clip数据不变。

当前仅完成文档自检；不重复运行001测试把结果冒充002。未来 migration 先合成旧库→新库，读写/回滚检查都在隔离数据目录；不得降版运行旧进程覆盖新字段。真实升级前导出备份/影响清单并另取授权。

## Risks and mitigations

| 风险 | 缓解与完成门槛 |
|---|---|
| 遗漏某个默认Canvas读写路径 | 全仓库按project_canvas_state/sourceCardId/revision审计；强制显式文档身份端到端回归 |
| 新旧客户端混写抹字段 | capability/schema保护，服务端保留权威字段，拒绝不支持的替换 |
| 共享文件在来源集删除后损坏 | 权威共享membership、全局引用删除保护、来源非所有权、只读媒体服务 |
| 多集更新部分成功 | 有界同事务revision向量，超过限额明确分批重审 |
| 动态索引显示错误采用 | 权威binding/Timeline为真，索引事务维护与重建检查，未知值不推断 |
| 单场仍很大 | 多文档显式分区，保持单文档限制；不提高节点上限掩盖问题 |
| 默认兼容双存储复杂 | 默认正文只留旧表，repository唯一入口，禁止镜像双写 |
| 导航界面过密 | 可收起面板/窄屏抽屉、稳定深链；单片无强制剧集层 |

## Review state and hooks

详见 [设计审阅清单](checklists/design-review.md)。文档质量通过不等于用户批准或功能验收。没有 .specify/extensions.yml，因此 before/after specify、before/after plan hooks均不适用。Phase 1后宪法复查无例外；停止，等用户审阅后再决定任务拆解。
