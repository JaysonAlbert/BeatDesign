# Tasks: 分集、场次导航与跨集共享资产

Input: 本目录spec.md、plan.md、research.md、data-model.md及contracts/。
Approval: 2026-10-21用户“评审通过，继续吧”，见approval.md。
Tests: 按批准的quickstart、宪法要求覆盖持久化、归属、并发、旧数据、浏览器与MCP。

## Phase 1 — Setup

- [x] T001 核对隔离分支、依赖、忽略规则、架构与审批，记录于 specs/002-series-scenes-shared-assets/approval.md。
- [x] T002 为模块建立受控scope/错误/容量类型，路径 src/core/series/contracts.ts、src/core/projects/canvas-scope.ts。

## Phase 2 — Foundational（全部故事前置）

- [x] T003 编写默认画布/多文档/错scope及回滚测试，路径 src/core/series/persistence.test.ts。
- [x] T004 新增Series、场次、画布目录、共享版本/关系/消费者/locator/receipt表及双进程幂等升级，路径 src/config/db/schema.sqlite.ts、src/core/db/sqlite.ts。
- [x] T005 实现默认旧表适配与场次文档独立CAS repository，路径 src/core/projects/projects.ts、src/core/projects/project-revision.ts。
- [x] T006 贯通命令canvasId及请求哈希/幂等/事务边界，路径 src/core/commands/contracts.ts、persist.ts、schema.ts、receipts.ts。
- [x] T007 Canvas v5兼容与scoped binding校验/旧客户端保护，路径 src/core/projects/project-snapshot.ts、src/core/organization/canvas-organization.ts、service.ts。
- [x] T008 贯通预检/intent/提交/来源指纹的canvasId与旧请求默认语义，路径 src/core/organization/generation-source.ts、src/core/commands/generation-contract.ts、src/core/workspace-lib/。
- [x] T009 贯通读取/保存/revision/导入/模板的文档scope，路径 src/routes/api/app/projects/、src/core/workflows/service.ts。
- [x] T010 浏览器typedAPI、缓存/轮询、保存和undo按文档隔离，路径 src/components/beatcanvas/use-project-snapshot-lifecycle.ts、src/components/beatcanvas/beatcanvas-shell.tsx、src/core/commands/client.ts。

## Phase 3 — US1 导航（P1）

Goal: 剧集/分集/场次可达，旧单片不受影响。
Independent test: 三空项目/同名场次，无生成，刷新/后退/四工作区范围一致。

- [x] T011 [US1] 实现Series与Episode创建/加入/改序/归档恢复及独立receipt域，路径 src/core/series/service.ts、src/core/commands/scoped-write.ts。
- [x] T012 [US1] 实现场次/文档目录操作、clip显式标签及合法scope解析，路径 src/core/series/narrative.ts。
- [x] T013 [US1] 提供共享内核HTTP读写及MCP工具，路径 src/routes/api/app/series/、src/mcp/series-tools.ts（scripts/mcp-server.ts入口）。
- [x] T014 [US1] 增剧集总览、Projects入口与可收起场次导航，路径 src/components/app/series-navigation.tsx、src/components/home/workspace-page.tsx、src/routes/series/。
- [x] T015 [US1] 四工作区URL上下文/失效提示/保存前切换及Editor完整时间线定位，路径 src/components/app/product-page-shell.tsx、workspace-project-route-page.tsx、src/routes/、src/components/editor/。
- [x] T016 [US1] 覆盖导航、兼容、排序、同名与无写定位用例，路径 src/core/series/navigation.test.ts、tests/e2e/series.spec.ts。

## Phase 4 — US2 场次独立画布（P1）

Goal: 600卡分场实际分区，保存、整理和来源不串文档。
Independent test: 单片六文档各100卡，不需Series。

- [x] T017 [US2] 实现创建/改名/归场/归档恢复画布与默认入口，路径 src/core/series/narrative.ts、src/components/app/series-navigation.tsx。
- [x] T018 [US2] 实现转移preview闭包/意图及运行作业阻塞/容量预检，路径 src/core/series/canvas-transfer.ts。
- [x] T019 [US2] 实现多文档原子转移及稳定locator/tombstone，路径 src/core/series/canvas-transfer.ts、src/core/projects/projects.ts。
- [x] T020 [US2] 搜索旧位置/旧take临时展开投影，组操作显式持久化，路径 src/components/beatcanvas/beatcanvas-shell.tsx、organization-panel.tsx。
- [x] T021 [US2] 转移与多文档UI/MCP、旧intent错文档、异步结果及undo隔离回归，路径 src/core/series/persistence.test.ts、tests/e2e/series.spec.ts。

## Phase 5 — US3 跨集固定版本（P1）

Goal: 共享身份唯一，版本升级不漂移，20消费者选择3个恰好3个变。
Independent test: 两集共享v1/v2，无Provider。

- [x] T022 [US3] 共享素材/Element发布、追加版本、推荐、归档恢复及provenance，路径 src/core/series/shared-assets.ts。
- [x] T023 [US3] 增受控共享媒体读取和本集membership授予，路径 src/routes/api/app/series/、src/core/series/shared-assets.ts。
- [x] T024 [US3] scoped绑定/模板统一resolver与消费者事务索引，路径 src/core/organization/service.ts、src/core/workflows/service.ts、src/core/series/shared-assets.ts。
- [x] T025 [US3] 采用preview/摘要/目标revision向量、共享卡copy-on-rebind与有界原子提交，路径 src/core/series/reference-review.ts。
- [x] T026 [US3] 显式本地化/脱离/删除引用保护，路径 src/core/series/reference-review.ts、src/core/projects/projects.ts、src/core/workspace-lib/assets/user-assets.ts。
- [x] T027 [US3] UI固定版本、保留/采用、消费者影响及归档恢复，路径 src/components/app/shared-elements-panel.tsx。
- [x] T028 [US3] 20→3采用、冲突全回滚、跨Series拒绝、缺文件/旧模板/双进程测试，路径 src/core/series/shared-assets.test.ts、tests/e2e/series.spec.ts。

## Phase 6 — US4 分类素材板（P2）

Goal: 本场/本集/共享查询、分页、候选及真实采用清晰。
Independent test: 合成2000媒体，无生成网络。

- [x] T029 [US4] 扩服务端范围/媒体/Element/用途分页与准确计数/cursor，路径 src/core/organization/service.ts、src/core/series/asset-query.ts。
- [x] T030 [US4] 更新Assets范围和URL筛选/请求取消/场次归类，路径 src/components/app/project-assets-workspace.tsx、project-organization-panel.tsx、src/routes/assets/。
- [x] T031 [US4] 素材详情区分批次/历史/母版/clip源区间并提供精确locator，路径 src/components/app/series-asset-details.tsx。
- [x] T032 [US4] 2000素材/跨页/重复membership/快速切换/真实采用回归，路径 src/core/series/asset-query.test.ts、tests/e2e/series.spec.ts。

## Phase 7 — Integration / Verification

- [x] T033 中英文消息及键盘/窄屏/失效空态，路径 messages/en.json、messages/zh.json、src/components/app/。
- [x] T034 添加12集20场/6000卡及2000媒体隔离fixture/manifest，路径 scripts/seed-series-fixture.ts。
- [x] T035 双连接升级、文档CAS/receipt故障、删除/归档并发和旧客户端覆盖测试，路径 src/core/series/cross-process.test.ts。
- [x] T036 验证SC-001–006、UI/MCP零任务上传、热缓存p95及浏览器截图，路径 tests/e2e/series.spec.ts、specs/002-series-scenes-shared-assets/verification.md。
- [x] T037 执行typecheck、全部Node测试、i18n、build及E2E，修复后记录实际结果于 specs/002-series-scenes-shared-assets/verification.md。
- [x] T038 更新状态、可运行指南与PR，按明确文件提交推送，路径 docs/SPEC_KIT.md、docs/PRODUCT_PLAN_AND_STATUS.md、specs/002-series-scenes-shared-assets/quickstart.md。

## Dependencies / Execution

Setup → T003–010 → US1 → US2 → US3 → US4 → Integration。
US2的文档repository先在基础阶段形成，因此US1也能独立导航；US3可在空白分集验证；US4可在合成素材验证。
同一文件顺序修改；本轮由单写入者执行，未启用代理并行。不同故事的独立测试准备可并行运行，实际服务修改按上述依赖串行。

## Parallel examples / MVP

US1导航测试与文案，US2纯闭包测试与fixture，US3只读消费者查询测试与UI文案，US4分页fixture与详情文案可分别在依赖就绪后并行准备；不把这些示例当代理授权。
可评审的MVP为基础身份+US1+最小独立场次文档；仅侧栏不满足002容量目标，全部故事和跨域检查通过才宣称完成。

## Phase 8: Convergence

- [x] T039 补齐素材来源集、共享身份/版本与跨集消费者详情，按 FR-018、contracts/ui 素材板约定（partial），路径 src/core/series/asset-details.ts、asset-query.ts、src/components/app/。
- [x] T040 补充快速范围切换及双语素材/共享交互，按 SC-004、SC-006（partial），路径 tests/e2e/series.spec.ts。

- [x] T041 补共享素材独立发布及归档恢复入口，按 FR-010/011/015（partial），路径 src/components/app/scoped-assets-board.tsx、src/core/series/asset-query.ts。

## Phase 9: Convergence

- [x] T042 消除退出定位的浮点视口漂移，并保留并发更新后的权威视口，按 FR-009（partial/HIGH），路径 src/components/beatcanvas/beatcanvas-shell.tsx、tests/e2e/series.spec.ts。

- [x] T043 转移预览同时核对服务端进行中作业，不只依赖可能滞后的卡片状态，按 FR-008、plan: source intent（partial/HIGH），路径 src/core/series/canvas-transfer.ts、src/core/organization/generation-source-intent.integration.test.ts。

## Phase 10 — 2026-10-23 已批准的六态界面重设计

- [x] T044 场次弹层改紧凑导航和对象菜单，保留命令/归档/归场/保存前切换。
- [x] T045 组织长表单拆为选组工具条、当前节点参考、移动预检和画布级菜单。
- [x] T046 节点选择编辑、按需生成设置、节点下方历史和图库；参数由现有能力决定。
- [x] T047 双语、键盘/窄屏和真实浏览器核验；类型/测试/多语言/生产构建；独立预览及证据。详见 contextual-ui-verification.md；人工视觉验收及真实生成不包含在此勾选中。
