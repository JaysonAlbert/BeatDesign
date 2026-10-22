# Tasks: 素材组织、共享参考与分层 Canvas

Input: 已批准 spec.md、plan.md、research.md、data-model.md、contracts/、quickstart.md。
2026-10-20 用户明确批准任务拆解与实现。无扩展 hooks。
测试来自已批准计划与宪章的持久化/并发/兼容要求；先写有意义的反例再实现。

## Phase 1: Setup

- [X] T001 记录需求及方案批准并确认独立 worktree，路径 specs/001-canvas-project-organization/plan.md。
- [X] T002 准备 packageManager 指定依赖、生成 schema/Paraglide，保留 pnpm-lock.yaml 和主实例。
- [X] T003 检查通用上游重复项并先创建对应 Issue，将链接写入 docs/PROJECT_ORGANIZATION.md。

## Phase 2: Foundation

- [X] T004 [P] 在 src/core/organization/canvas-organization.ts 及其测试实现组/绑定/实例 schema；“200 / 20 / 2 MiB”“64 / 100”限制不绕过。
- [X] T005 [P] 在 src/core/organization/organization-document.ts 及测试实现目录与 Element 纯操作；“500 / 8”“10000 / 256 / 100”“2 MiB”上限与稳定 ID。
- [X] T006 [P] 在 src/core/workflows/workflow-template.ts 及测试实现严格白名单定义、槽和实例化；“100 / 100 / 128 KiB”、正文/参数原限制。
- [X] T007 在 src/config/db/schema.sqlite.ts、src/core/commands/persist.ts、receipts.ts 增加组织/模板表、requestHash 与事务化命令边界；所有新 envelope 在 fallback 前检查。
- [X] T008 在 src/core/projects/projects.ts、project-snapshot.ts、project-canvas-document.ts、src/core/commands/canvas-diff.ts 统一 v4 保存/restore/undo/merge，旧客户端保护和旧 output 引用不改写。

## Phase 3: US1 镜头总览 (P1)

Goal: 可持久化组与局部显示，不损害真实卡片、历史和采用。
Independent test: 140 卡合成 fixture 折叠为 <=12 入口，展开、移动、缩放、解除、重载和旧 take 保持。

- [X] T009 [US1] 在 src/core/organization/canvas-organization.test.ts 覆盖聚合边、删除映射清理、隐藏坐标与 v3 往返反例。
- [X] T010 [US1] 在 src/core/commands/canvas-commands.ts、schema.ts 注册 group/view 操作，同批最终校验。
- [X] T011 [US1] 在 src/components/beatcanvas/organization-panel.tsx 实现组建立预览、命名、移动/缩放、折叠、解除及镜头下钻，接入 beatcanvas-shell.tsx。
- [X] T012 [US1] 在 use-beatcanvas-react-flow-adapter.ts、use-project-snapshot-lifecycle.ts 接入 canonical 组投影与持久化，保留现有 Take 入口、undo、运行状态。
- [X] T013 [US1] 在 src/core/editor/timeline-usage.ts 和对应 API/MCP 提供 getTimelineClipSource 真实采用查询与 UI 定位。

## Phase 4: US2 目录 (P2)

Goal: 逻辑目录、去重分页与明确搜索范围，文件/剪辑不变。
Independent test: 多 category 同 Asset、500 条以后分页、目录预览/重挂/冲突和重载。

- [X] T014 [US2] 在 organization-document.test.ts 覆盖目录循环、深度、重名、批量归类、非空移除与预览 revision。
- [X] T015 [US2] 在 src/core/organization/service.ts 实现 org 读/预览/去重分页和事务校验 helper，不改 membership.category。
- [X] T016 [US2] 在 src/routes/api/app/projects/$projectId/organization.ts 和 assets/index.ts 添加 GET，在 src/mcp 注册 organization get/apply、asset query；旧 asset_list 数组兼容。
- [X] T017 [US2] 在 src/components/app/project-organization-panel.tsx 接通目录树、批量归类、当前目录/全项目搜索与移除预览，并接入 Assets。

## Phase 5: US3 Elements (P2)

Goal: 命名共享参考与固定版本输入；换当前版本仅触发复核。
Independent test: 两个使用者、保留旧版/采用新版、删除与绑定竞态；历史和 Timeline 不变。

- [X] T018 [US3] 在 organization-document.test.ts 覆盖追加版本、当前指针、软删除/恢复和有消费者拒绝。
- [X] T019 [US3] 在 canvas-commands.ts、organization/service.ts 接通 bind/unbind/review 与事务归属校验；所有 v4 写入口维持一致。
- [X] T020 [US3] 在 project-organization-panel.tsx 与 organization-panel.tsx 接通保存参考、版本选择、使用者定位和复核操作。
- [X] T021 [US3] 在 src/core/generation-providers/submit.ts、src/mcp/generation-canvas.ts 及 generation contract 校验精确绑定，存既有来源记录；不变更模型路由。

## Phase 6: US4 模板 (P3)

Goal: 安装级本地模板库、显式目标绑定、可编辑未完成草稿。
Independent test: 两次独立实例、同键重试、跨项目拒绝、缺槽阻塞，无 provider/key 仍可组织。

- [X] T022 [US4] 在 workflow-template.test.ts 覆盖白名单泄漏、循环、输入顺序、稳定 ID、缺槽与 200 卡/字节限额回滚。
- [X] T023 [US4] 在 src/core/workflows/service.ts 与 commands/persist.ts 实现模板预览/捕获/改名/移除/原子实例化，冻结槽与模板 revision。
- [X] T024 [US4] 在 src/routes/api/app/workflow-templates/ 和 src/mcp 增加共享查询/操作，接通 organization-panel.tsx 模板 UI。
- [X] T025 [US4] 在 generation preflight/submit 对 Canvas 强制 sourceCardId、核对 intent/绑定摘要，缺槽和陈旧配置拒绝；Standalone Studio 保持兼容。

## Phase 7: Integration and verification

- [X] T026 在 messages/en.json、messages/zh.json 补齐组织入口与可访问性文案，保留 locale fallback。
- [X] T027 在 src/core/organization/persistence.test.ts、src/mcp/server.runtime.test.ts 验证跨进程 CAS、故障回滚、同键异内容、旧操作/undo 与删除竞态、MCP→UI revision。
- [X] T028 在 scripts/seed-organization-fixture.ts、tests/e2e/organization.spec.ts 和 start-e2e.mjs 建独立 140 卡/双语键盘/缺槽示例，Windows 后台不闪窗。
- [X] T029 运行 quickstart.md 的 typecheck/test/i18n/build、独立 MCP/浏览器/迁移检查，记录实际覆盖；组织过程 generation/upload/provider 计数为零。
- [X] T030 更新 docs/PROJECT_ORGANIZATION.md、PRODUCT_PLAN_AND_STATUS.md、SPEC_KIT.md 和 tasks.md，提交自有草稿 PR并附上验证；主实例/真实影片不迁移，视觉验收与合入部署分开。

## Dependencies and parallel execution

T001–003 → T004–006（不同领域文件，可按模板团队策略并行）→ T007–008 → US1。
US2/US3 的纯模型可并行研究，但共享 kernel/schema/路由修改串行；US4 使用已完成的组与绑定。
每故事先完成其测试，再完成模型、接口、UI 和独立检查；T026–030 集成收尾。
示例：基础完成后目录查询测试与 Timeline usage 测试可在不同文件并行；同一文件只能一个写入者。

## Implementation strategy and coverage

先验证 P1，再接 P2/P3；用户批准的是全部四条故事，不能把 P1 可用报告为全部完成。
FR-001–006 → T004,T008–013；FR-007–010 → T005,T014–017；FR-011–014 → T018–021；
FR-015–017 → T006,T022–025；FR-018–021 → T007,T008,T021,T025,T027,T029；
FR-022–023 → T026,T028,T029。SC-001–007 全部通过 T009,T014,T018,T022,T027–029 验证。
各任务只在实现及对应验证完成后标 X；reviewer-owned checklist 不用任务状态冒充。

## Phase 8: Convergence

2026-10-20：检查 23 FR、7 SC、16 验收场景、8 项方案决策和 5 项宪章原则。
两项 partial / HIGH；没有 missing、contradicts、unrequested 或 CRITICAL。
下面任务接续 speckit-implement，不替代原任务或用户视觉验收。

- [X] T031 修复普通生成节点恢复后尺寸被默认值覆盖；补充旧文档往返与状态/Take 同步反例，保持全部 canonical frames per US1/AC2, SC-001, plan: v4 compatibility (partial)。
- [X] T032 补齐中文 Canvas 折叠/展开、共享参考设置、素材搜索和模板插入的真实浏览器行为验证，并保持零生成/上传 per FR-022, SC-007 (partial)。


## Phase 9: Interface parity

补齐原交互约定的可见信息，不新增数据权威或人工审批系统。

- [X] T033 将实际 Timeline 采用计数、未记录人工审核标识和精确源区间/静音状态接入界面 per FR-004, FR-006, contracts/user-interface.md (partial)。
- [X] T034 在缺少必填参考或模型不可用时禁用 Canvas 生成按钮并展示原因；模板提供明确插入坐标 per FR-016, contracts/user-interface.md (partial)。

## Phase 10: Convergence

2026-10-20：复核原交互约定，发现一项次要界面 partial / MEDIUM：
Assets 组织在窄屏仍是内联折叠面板，没有约定的可访问抽屉。

- [X] T035 在窄屏以可关闭、焦点受控的抽屉呈现 Assets 组织，保留桌面折叠区域与未保存输入；补充键盘打开、Escape 关闭和焦点返回浏览器验证 per plan: UI, contracts/user-interface.md (partial)。

## Phase 11: Convergence

2026-10-20：实际浏览器截图复核发现一项 partial / LOW：
缓存图片已经解码时，Asset 卡片的 effect 仍可能把预览状态重设为 loading。

- [X] T036 修复缓存图片加载事件与初始化 effect 的竞争，已解码图片不再显示加载遮罩；在八镜浏览器示例断言图片可解码且加载提示消失 per FR-020, FR-023, plan: browser verification (partial)。

## Phase 12: Group containers and arrangement

2026-10-20 用户明确要求优先补齐“组容器、组内整理和组间排列”。
参考本项目归档的 Higgsfield 实测；保留多组同时显示，不增加强制单组展开。
布局是显式、可撤销的操作；自动容器显示只包住可见内容，不改变素材或历史输入。

- [X] T037 实现可见成员边界与标题/Take 预留、组内 tidy/row/column、组间排列和适应内容的纯布局模型；覆盖隐藏历史、大小不一、固定障碍与确定性。
- [X] T038 将 layout_group、fit_group、arrange_groups 接入共享 Canvas 命令，保持事务、revision、UI/MCP 一致性和布局外数据不变。
- [X] T039 在组标题与组织面板提供双语整理/横排/竖排/适应内容及多组选择排列，修正显示组框的拖动/缩放坐标，沿用 undo/redo。
- [X] T040 用真实 Chrome 验证多组展开、容器标题/Take 不交叠、组内与组间排列、保存重载和撤销，保存多张预览截图。
- [X] T041 完成 typecheck/test/i18n/build、隔离预览更新、文档与现有草稿 PR 更新；不整理真实影片或替换主环境。
