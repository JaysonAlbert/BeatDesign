# Plan Review: Canvas 项目组织

日期：2026-10-20。结果是方案文档自检，不是用户批准或功能验证。

## 文档与决策

- [x] 用户已明确批准需求，原话与日期写入 spec.md。
- [x] speckit-plan setup 成功；无 before_plan/after_plan 扩展 hooks。
- [x] 三路源码研究完成，research.md 对每个关键取舍提供依据与替代方案。
- [x] plan、data-model、commands/UI contracts、quickstart 均已完成。
- [x] 宪章在研究前和设计后检查通过，没有未解释例外。
- [x] 不把 141 条文档卡片记录当作同等数量的可见节点。
- [x] 版本、并发、idempotency、未知模型、缺槽、分页与升级/回退已明确。
- [x] 交叉研究复核指出的 resize、删除映射清理、全部 v4 写路径事务保护、
  envelope fallback 和 Canvas sourceCardId/intent 缺口均已补入相应契约与反例。
- [x] 未生成 tasks.md，未修改应用源码、数据库或主服务。

## 需求覆盖

| 要求 | 设计归属 | 验证 |
|---|---|---|
| FR-001–005 | Canvas v4、投影、组与历史 UI | P1，总览/下钻/解除/旧 take |
| FR-006 | Timeline usage + getTimelineClipSource | 实际来源、activeTake、源区间 |
| FR-007–010 | 组织状态、目录操作、去重分页 | P2，树/批量/搜索/移除预览 |
| FR-011–014 | Elements、固定绑定、复核与软删除 | P2，换版本/消费者/竞态 |
| FR-015–017 | 安装级模板库、白名单、typed slots | P3，独立实例/缺槽/目标归属 |
| FR-018–019 | kernel、tx receipt、无生成副作用 | 计数为零、CAS、同键异内容 |
| FR-020–021 | v3→v4、旧客户端保护、明确整理预览 | 旧数据 fixture、不自动回写 |
| FR-022–023 | 双语键盘 UI、140 卡合成项目 | E2E 与独立浏览器/MCP |

## Success Criteria 验证落点

- [x] SC-001：总记录/可见投影/媒体分别计数，八镜加四支持入口。
- [x] SC-002：从总览到主要制作对象最多三次操作。
- [x] SC-003：目录持久化与 Asset/文件/剪辑不变断言。
- [x] SC-004：Element 双使用者、精确旧输入与 clip 保留。
- [x] SC-005：两实例独立、缺槽明确，任务/上传/provider 计数为零。
- [x] SC-006：共享命令、revision 刷新、跨进程事务和稳定 ID 重试。
- [x] SC-007：隔离项目中英文与键盘覆盖。

## 审核状态

- [ ] 用户批准技术方案进入 tasks。
- [ ] 生成任务清单与跨文档 analyze（方案批准后）。
- [ ] 应用实现、自动测试、预览、人审、合入与部署（后续阶段）。

默认 workflow 的 review-plan 要求“Review the plan before generating tasks.”。
当前仅最后这道用户方案审核尚未通过；本清单其他通过项不替代该批准。
