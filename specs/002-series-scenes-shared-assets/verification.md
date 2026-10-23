# 002 实现与验证回执

2026-10-21，北京时间。用户“评审通过，继续吧”的授权见 [approval.md](approval.md)。本次已完成任务拆解、一致性分析、隔离实现和收敛修复；技术检查通过。用户视觉验收、合入、部署、真实影片迁移分别等待后续授权，未据技术结果代为批准。

## 源码与环境

- worktree：`D:/Projects/BeatDesign-worktrees/canvas-project-organization`；实际分支 `codex/canvas-project-organization`，实现起点 `41f5d30`，实现提交 `35765d4`；002独立规格目录，[Fork草稿PR16](https://github.com/JaysonAlbert/BeatDesign/pull/16)已更新并推送，未合并。
- Windows、Node v24.14.1、Chrome 155.0.8059.80；复用现有node_modules junction，未重新安装依赖。
- 单文档仍为200卡/2MiB/64组。默认正文保留在旧project_canvas_state，非默认正文独立存储及CAS；打开旧项目不自动拆场或写回。
- 源码与UI/MCP使用同一事务内核及14张新增组织/时钟元数据表，没有独立后端或媒体副本。

## 自动检查

| 检查 | 实际结果 |
|---|---|
| `node node_modules/typescript/bin/tsc --noEmit` | 通过 |
| `node scripts/run-tests.mjs` | 537通过，0失败，0跳过 |
| `node scripts/check-i18n.mjs` | en/zh/ja各963键通过 |
| Paraglide + Vite production build + sanitize | 通过，独立data/series-build-output，避免覆盖旧预览已锁定的构建 |
| `node node_modules/@playwright/test/cli.js test` | 全部30项通过（2.8分钟）；含8项002用例及既有22项回归 |
| 3060生产构建Chrome实测 | 中文总览/场次画布导航/素材板可操作，图片已解码，0页面异常，0生成/上传请求 |
| 3061 MCP + 3060 HTTP回读 | 同一Series的12集、所选文档100卡、筛选素材1条一致 |
| 合成媒体完整性 | 隔离持久预览2,000个Asset逐文件SHA256均与seed manifest一致 |
| `git diff --check` | 通过 |

解码用例使用已存在并核实的FFmpeg 7.1及ffprobe工具，通过BEATDESIGN_FFMPEG/BEATDESIGN_FFPROBE指定；最后完整Node运行没有以skip代替解码。上述为本机检查，不表述成GitHub CI或发布验证。

## 需求追溯与关键证据

| 范围 | 已验证行为与入口 |
|---|---|
| FR-001–004 / US1 | Series聚合、唯一Episode关系、场次目录、失效/空态与稳定URL；navigation.test.ts、cross-process.test.ts、series.spec.ts |
| FR-005–009 / US2 | 六文档各100卡、独立CAS/receipt、错scope拒绝、依赖闭包原子转移、locator、临时展开；persistence.test.ts、shared-assets.test.ts、generation-source-intent.integration.test.ts、浏览器定位用例 |
| FR-010–016 / US3 | 素材独立发布/归档/恢复，固定版本共享、本集受控membership、精确20→3采用、保留旧参考卡、本地化/脱离保留来源；shared-assets.test.ts及UI/MCP互读 |
| FR-017–018 / US4 | 2,000素材准确分页去重、显式/隐式场次归类、来源集与版本、同批/同一步骤历史/实际剪辑区间；asset-query.test.ts、asset-details服务、旧take回归和素材板浏览器用例 |
| FR-019–024 / 共用边界 | 命令身份/版本/归属、v5旧客户端保护、资源上限、双语焦点/窄屏、零自动生成；共享内核测试、全套Node/E2E及浏览器网络记录 |

高风险场景实际使用隔离SQLite验证：两进程同时升级旧表而旧默认JSON/手动封面不变；两进程争用同一narrative revision只成功一个；共享归档与新绑定竞争只有合法一方成功；在最后receipt插入注入失败时，已执行的全部Canvas修改和membership授予均回滚，没有成功receipt。

生成intent摘要包含实际canvasId；场次intent改用默认文档提交会在Provider前拒绝。转移同时检查未过期未消费intent、卡片状态和服务端pending/processing/queued/running历史记录，避免客户端状态滞后时移动运行来源。测试使用合成历史，不提交实际模型作业。

## SC量化

| 标准 | 实测结果 |
|---|---|
| SC-001 | 合成12集×20场，从总览进入一集、打开导航、选场；刷新/后退保持合法身份，旧URL进入默认画布 |
| SC-002 | 总6,000卡（5,978场次卡+22默认引用卡）；热缓存30次切场p95 **328ms**，阈值2秒；只查询目标正文与轻量目录 |
| SC-003 | 20个固定v1消费者，推荐v2后全部不漂移；UI选3个采用，MCP回读恰好3个变；过期预览/最后写入故障均无部分采用 |
| SC-004 | 本集2,000素材，30次热缓存筛选p95 **51ms**，阈值1秒；中英文各连续20次范围切换不串范围，500之后的结果可检索 |
| SC-005 | 旧媒体/历史/具体clip与源区间回归通过，2,000媒体hash不变；组织操作无生成/上传调用 |
| SC-006 | 中英文、键盘与768/390px窄屏代表流程及既有组/参考/模板交互通过；人类视觉验收仍待用户 |

性能是同一Windows机器、Chrome、SSD合成小媒体、热元数据缓存的操作到可见可操作时间；没有把服务查询耗时当UI时间。冷启动、真实大视频解码、其他机器或海量并发没有纳入这些p95结论。

## 收敛修复

T039–043完成：素材详情补齐身份/版本/跨集消费者，补范围切换与双语检查，补共享素材独立管理，消除退出临时定位的浮点保存以及并发视口回退，转移增加服务端运行作业校验。浮点修复保留权威精确坐标；并发MCP更新后退出定位不增加额外revision。

复查24FR、6SC的可实现部分、四故事验收路径、9项架构决策和5条宪法原则。没有剩余阻断实现的发现；不把用户视觉、合入和部署当成已完成的代码任务。原design-review.md保持设计时审阅记录，审批以approval.md为准。

## 预览与引用资源

- [中文独立预览](http://127.0.0.1:3060/zh/series/synthetic-series-002)，MCP loopback3061，共用新隔离数据目录 `data/series-preview-20261021`。
- 两个服务使用受控前台进程；测试MCP令牌仅在进程环境及当前测试上下文中，未写入源码、截图或运行回执。后台启动命令曾被自动审批以“blocked by policy”拒绝，改用前台进程后启动及验证成功。
- 主3020/3031进程保留；旧001网页3050保留（核验时3051未监听）。未更改默认入口、隧道、模型服务或影片暂停状态。
- [截图与性能资源](../../docs/references/beatdesign/2026-10-21-series-organization/README.md)、[证据hash](../../docs/references/beatdesign/2026-10-21-series-organization/evidence-manifest.json)。本轮截图为BeatDesign合成数据，不冒充竞品实测。
- [可复现指南](quickstart.md)。本轮没有重新访问竞品；此前Higgsfield/LibTV参考资源以research.md记录为准。

## 交付边界

源码、自动检查、浏览器与MCP回读：通过。用户视觉验收：待审阅。Fork：草稿PR；上游：未提交002 Issue/PR、未接受。合入、部署、真实影片拆场、正式封面/母版替换、模型生成、发布：均未执行。本功能先服务于自有长视频制作流程，通用上游贡献仍须另按先Issue后PR执行。


## 2026-10-23 场次与 Canvas 界面重设计

当前后续实现、测试与独立预览以 [重设计回执](contextual-ui-verification.md) 为准。上文“草稿 PR”是 2026-10-21 历史状态；原 PR #16 后来已合入，本轮另开分支。
