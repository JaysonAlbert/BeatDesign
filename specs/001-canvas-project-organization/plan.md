# Implementation Plan: 素材组织、可复用参考与分层 Canvas

**Branch**: `codex/canvas-project-organization` | **Date**: 2026-10-20 |
**Spec**: [spec.md](spec.md)

**Input**: 已于 2026-10-20 批准的四条用户故事。
**Status**: Approved for tasks and implementation — 2026-10-20。
用户回复“批准方案，继续任务拆解与实现”；不代表合入、部署或真实影片迁移获准。
**Baseline**: `168bd75`；工作目录为当前独立 worktree。

## Summary

Canvas 用持久化命名分组与显示投影呈现镜头，Assets 用逻辑目录管理文件，Elements 保存
可复用参考及固定版本，模板复用制作结构。时间线采用、真实媒体和生成历史继续复用既有服务。
既有输出本已部分收在 Takes 中；不通过删除记录换取视觉简洁。

四种数据有明确权威位置：Canvas v4（组、绑定、实例），项目组织状态（目录、Element），
本地模板库（可复用定义），原 Timeline（真实剪辑采用）。UI 与 MCP 共用增量 Command Kernel，
保留 revision、项目归属、稳定 ID 与事务回执。详见 [数据模型](data-model.md) 与
[操作约定](contracts/commands.md)。

## Technical Context

**Language/Version**: TypeScript 5.9、React 19；沿用 Node >=22、pnpm >=10。
**Primary Dependencies**: 现有 TanStack Start/Query、React Flow 12.11.2、Zod 4、Drizzle/libSQL、
Tailwind 4、Base UI/shadcn、Paraglide；计划不引入新运行依赖。
**Storage**: 原本地 SQLite 和项目媒体存储；新增两个元数据表和 receipt requestHash 列。
**Testing**: 现有 Node 测试 runner、共置单元/契约测试、临时数据库 MCP 测试、
Playwright 与现有外部 Chrome 人工视觉检查。
**Target Platform**: localhost Web；Windows/PowerShell 为当前验证环境，保留跨平台启动路径。
**Project Type**: 同一全栈本地应用内的增量功能，不建立第二后端。
**Performance Goals**: 140 卡示例折叠到最多十二入口，三次操作内到达镜头主要制作对象；
投影使用 O(V+E) 索引与去重，不在折叠时解码视频或重新查询每个节点。
**Constraints**: 200 卡、20 引用/卡、2 MiB snapshot、500 操作/批保持不变；
隐藏记录仍计数。组织文档上限 2 MiB、模板定义 128 KiB，超限原子拒绝。
**Scale/Scope**: 当前八镜示例及任意同等规模项目；项目内目录和 Elements，
安装内跨项目模板复用。无团队权限、云同步、发布或自动模型任务。

## Constitution Check

*Phase 0 入口与 Phase 1 设计完成后均检查。两次结果：PASS；无例外。*

| 原则 | 方案约束与核实结果 |
|---|---|
| I. 同一 Project | 沿用 Project、membership、媒体与生成服务；只新增类型化元数据 |
| II. 精确 Asset/版本 | 组不属于模型输入；Element 固定版本；Timeline usage 只读原 Timeline |
| III. 共享命令 | 所有写入经 kernel；Web/MCP 跨进程 CAS；新写入与 receipt 原子提交 |
| IV. 组织与生成分离 | 模板只建 idle 草稿；目录、组和参考变更不上传、不提交生成 |
| V. 证据边界 | 当前只有源码研究和方案文档检查；实现后才运行完整验证并提供隔离预览 |
| 兼容与隐私 | 旧项目不自动整理，v4 保护旧客户端写入，示例不含真实影片与秘密 |
| 阶段审核 | 已记录需求批准；当前停在 review-plan，尚未生成 tasks.md |

## Project Structure

### Documentation (this feature)

```text
specs/001-canvas-project-organization/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── commands.md
│   └── user-interface.md
├── checklists/
│   ├── requirements.md
│   └── plan-review.md
└── tasks.md  # 方案获准后由 speckit-tasks 创建，当前不存在
```

### Source Code (repository root)

```text
src/config/db/schema.sqlite.ts           # 两张新元数据表；生成 schema.ts 不手改
src/core/organization/                  # 新：类型、纯操作、事务持久化、资产查询
src/core/workflows/                     # 新：模板白名单、捕获、实例化与库服务
src/core/projects/                      # v4 normalize、restore、revision、兼容写保护
src/core/commands/                      # schema/executor/persist/diff/receipts 扩展
src/core/beatcanvas/                     # 元素解析、模板草稿与纯可见投影
src/core/editor/                        # 原 Timeline 来源 helper + usage 派生
src/components/beatcanvas/              # 组节点、组操作、历史筛选与状态定位
src/components/app/                     # Assets 目录、Elements、模板面板
src/routes/api/app/                     # 已有 commands、asset list 与只读组织/模板/usage
src/mcp/                               # 原 Canvas tools 扩展 + 同服务的新查询/操作工具
messages/en.json / messages/zh.json      # 同一批新文案
tests/e2e/                             # 合成项目、双语、键盘与 MCP→UI
scripts/                               # 隔离 fixture/预览入口及必要 Windows runner 适配
```

**Structure Decision**: 保留现有目录体系；organization 与 workflows 是 kernel 下的领域模块，
不是独立应用、数据库或另一套项目状态。上述新路径是拟议落点，不能视为已存在能力。

## Phase 0: Research

已完成 [research.md](research.md)，覆盖：
真实分组缺口、隐藏历史、绝对坐标、output 引用恢复、Asset 去重分页、Element 版本、
跨进程事务、模板生命周期、未绑定输入阻塞、activeTake 来源及隔离验证。
全部未知项已有取舍，无待决技术选项冒充确定事实。

## Phase 1: Design

1. Canvas v4：groups、绑定、模板实例独立于 cards；所有折叠和端点聚合为纯投影。
2. `project_organization_state`：一项目一行的 revisioned 元数据文档。
3. `workflow_template`：安装级本地模板库，与源项目删除解耦。
4. 共享 commands 与事务：完整校验后同时保存受影响文档和 receipt；移除 Element 与绑定
   写入在同一写事务边界检查，拒绝竞态悬空。旧卡片操作、snapshot 保存、undo/restore、
   系统结果同步等全部 v4 写入口一并重验，不能留下旁路。
5. UI：现有 AppShell/浮层中增加目录与参考入口、命名镜头组、版本查看和模板预览；
   真实采用信息来自 Timeline usage，不增加媒体索引笔记。
6. 旧项目：读时补默认值；第一次整理先预览，明确应用才写入，不猜测真实影片镜头归属。

模型字段、状态转换、大小和关系约束见 [data-model.md](data-model.md)；
增量操作、revision 与错误规则见 [contracts/commands.md](contracts/commands.md)；
可见入口和下钻见 [contracts/user-interface.md](contracts/user-interface.md)。

## Delivery Sequence

以下是方案中的交付顺序，不是已执行任务清单：

1. 基础：v4 往返、兼容写保护、原子新命令回执、纯投影和合成 fixture。
2. P1：命名镜头组、解除分组、局部参考、历史入口、真实 Timeline usage；先形成可审阅预览。
3. P2：素材目录与去重分页；项目内 Elements 与固定版本绑定。
4. P3：本地模板库、白名单捕获、跨项目显式绑定、未完成草稿与服务端生成阻塞。
5. 集成：UI/MCP 并发、旧项目、新数据库与升级、完整自动检查和中英文浏览器验证。

各阶段独立验证；某一阶段可用不等于其余需求完成。实现前按用户规则重查通用上游
Issue/PR，先建立或复用对应 Issue；自有流程与本地模型配置不混入通用提交。
Spec Kit 工具安装/规则与产品实现保持可区分的提交。方案审核通过前不创建实现 PR。

## Verification and Compatibility

- v3 输入读为 v4，不丢原卡片、frames、Asset、引用、旧快照和剪辑；仅新的明确写操作保存 v4。
- 所有 snapshot builder、restore、normalize、diff/merge、undo/redo 一并覆盖，隐藏成员不丢 frame。
- group resize 仅改组框，删除指定结果同步清空 resultCardId 与绑定/实例映射。
- 对旧客户端 replacement 做原始版本检查；unsupported version 不能被 normalize 成空或降级丢字段。
- 目录只改逻辑位置；Element 换当前版本仅产生复核状态；模板重复实例化不重复 ID。
- 事务故障注入证明状态与 receipt 同回滚；多进程绑定/移除 Element 竞态无悬空。
- 不改 `getTimelineClipSource` 的剪辑含义，旧 take 的实际 source range 按现有 helper 返回。
- 组织全过程对生成、上传、provider 设置计数断言为零；缺 key 仍可组织和搭建模板。
- Canvas 生成必须带 sourceCardId，intent 绑定审核摘要；遗漏来源或重复使用变更前 intent 均拒绝。
- 实现后运行 typecheck/test/i18n/build，再做独立 MCP→UI、浏览器、迁移和本地路由检查。
  [quickstart.md](quickstart.md) 给出命令和预期，不以本阶段文档检查冒充这些验证。
- 主 3020/3031、真实 data/ 和影片保持原状；合成 preview 使用独立目录，端口不接管已有进程。

## Risks and Mitigations

| 风险 | 处理 |
|---|---|
| 显示端点映射污染真实引用 | 纯 projection；恢复过程不改语义 ID；旧 output 引用回归 |
| 折叠或删除组丢失媒体/坐标 | canonical frames；明确 ungroup 操作；禁止走递归 deleteShape |
| Web/MCP 并发产生悬空或重复实例 | tx 注入所有读取，CAS + requestHash + 原子 receipt |
| 模板漏槽变成文本生成 | typed pending slots；服务端 preflight/submit 共享阻塞检查 |
| 模板无凭据不能编辑 | 实例化只用 catalog，不调用 provider readiness |
| 新格式被旧程序写坏 | v4、兼容端点保护、部署 Web/MCP 同版本、回退使用旧数据副本 |
| JSON 状态超出预期规模 | 资源上限、去重分页、明确容量错误；不静默截断 |
| 功能跨度大，阶段状态混淆 | P1/P2/P3 分交付，任务与验收逐项映射，预览/接受/合入/部署分开 |

## Complexity Tracking

没有宪章例外。两张元数据表分别承载项目组织和跨项目模板生命周期；
未启用的 project_workflow_state 保持原样。复用已有资产、生成、Timeline 与 Command Kernel，
不增建独立服务。JSON 聚合状态选择适用于当前有界本地规模，取舍记录于 research.md。
