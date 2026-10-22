# Research: Canvas 项目组织

日期：2026-10-20。基线：`168bd75`，调研未修改应用源码或运行实例。
按 speckit-plan 分别完成 Canvas、组织持久化、模板与验证三路只读研究，再统一取舍。
本文的“决定”是待审核的设计，不是当前已支持能力。

## R1. 先区分可见节点、文档记录与实际媒体

- **Evidence**: `src/core/beatcanvas/generation-history.ts` 已将媒体输出收在父生成对象的
  Takes 中；分析输出另有可见报告节点。`project-snapshot.ts` 保存完整卡片记录。
- **Decision**: 不把文档卡片数当作可见节点数；新视图只投影显示，不删除 output。
  测试同时记录总卡片、可见入口、实际素材数和定位所需操作数。
- **Rationale**: 前一轮 141 卡统计包含隐藏输出；简单清理历史既不能证明视图改善，也可能
  损害旧 take、生成来源和已有剪辑。
- **Alternatives considered**: 删除候选节点、每次复制一个“最终画布”、只保留最新结果，均拒绝。

## R2. 用 Canvas v4 保存真正的组，坐标保持绝对值

- **Evidence**: `react-flow/react-flow-editor.tsx` 的组是运行时 parent/child；
  `use-beatcanvas-react-flow-adapter.ts` 捕获只遍历真实卡片；`nodes/workflow-group-node.tsx`
  只有透明边界。当前普通删除会递归删除子节点。
- **Decision**: v4 snapshot 增加类型化 `organization`，内含 groups、Element 绑定和模板实例；
  组不是媒体卡片。canonical `frames[cardId]` 保持绝对坐标，React Flow 相对坐标只是投影。
  折叠不改 frames；组移动以增量同时平移成员，解除分组保留成员。
- **Rationale**: 分组能持久化、撤销和并发合并；隐藏节点无需挂载也有完整几何事实来源。
- **Alternatives considered**: 仅保存 React Flow parentId 会绑死运行时结构；v3 可选扩展
  容易被旧 normalizer 静默丢弃，因此采用显式 v4 和兼容写入保护。
- **Compatibility**: 新 reader 接受已有 v3/已兼容旧形态，内存补空 organization；读不回写。
  不支持的未来版本直接拒绝。v4 组织存在时，旧格式 snapshot replacement 拒绝并提示刷新；
  旧增量命令仅在能保留新元数据不变量时可继续。数据库回退必须还原迁移前副本，不能用旧程序
  写新数据。200 卡、20 references/card、2 MiB 上限不变。

## R3. 显示连接与真实生成输入分离

- **Evidence**: `project-canvas-document.ts` 的 restore plan 目前会把 output 引用映射为父
  generation；`canvas-diff.ts` 和 `use-project-snapshot-lifecycle.ts` 未处理组字段。
- **Decision**: 投影把隐藏成员端点映射到组，并按端点对聚合；成员自环不显示，但保留可检查的
  原始关系。恢复过程不再把显示端点映射写回语义引用。分组、绑定和实例元数据加入 diff、merge、
  undo/redo，冲突按稳定 ID 和字段判定。
- **Rationale**: 当前展示或父节点换版不能改变用户选定的具体 output，更不能伪改旧任务快照。
- **Alternatives considered**: 把组塞入 referenceCardIds、用笔记中转二十个素材均拒绝；
  不增加模型输入上限来解决组织问题。

## R4. 素材目录与 Elements 使用一个项目组织状态表

- **Evidence**: `schema.sqlite.ts` 的 membership 按 project/asset/category 唯一；一个 Asset
  可有多条 category 记录。`workspace-lib/assets/user-assets.ts` 当前列表封顶且可能重复。
- **Decision**: 新增 `project_organization_state` 一行一个项目，保存文件夹、assetLocations、
  Elements 与追加式版本。目录按 Asset ID 唯一归属，不修改 category 或文件路径。
  新资产查询用项目 membership 去重后分页，支持当前目录/全项目检索。
- **Rationale**: 沿用现有文档 + revision 模式；组织生命周期不依赖 Canvas 节点存在与否。
- **Alternatives considered**: 四组规范化表有更强外键和大规模查询能力，但当前受限本地规模
  不需要额外迁移复杂度；Canvas snapshot、config、独立 JSON 文件或第二数据库均不作为目录权威。

## R5. Element 绑定冻结版本，换当前版本只产生待复核状态

- **Decision**: Element 当前版本是组织数据；Canvas binding 固定 elementId/versionId/assetId。
  引用对应版本的稳定真实 Asset 卡，不建“永远跟随最新”的媒体代理。当前版本改变时比较指针
  派生 needs_review，不批量改写消费者或时间线。用户可明确应用新版，或确认继续使用旧版。
- **Rationale**: 新版本不等于已接受版本；实际输入应保持明确且有序。提交时校验绑定并把精确
  来源保存进现有生成 history/input，不建立另一套生成数据库。
- **Alternatives considered**: 可变媒体代理会让旧配置与来源难以解释；每次换版自动重跑不在授权范围。
- **Removal**: 有活跃绑定时禁止移除；解除后软删除入口，保留版本及历史任务来源。删除检查和绑定
  写入使用同一事务化边界，避免检查通过后另一进程新增绑定。

## R6. 全部新写入共用 Command Kernel 和原子 receipt

- **Evidence**: `commands/persist.ts` 在保存状态后调用 `receipts.ts`；旧 receipt 只校验
  commandId/type。`project-revision.ts` 目前只返回 Canvas/Timeline revision。
- **Decision**: 新命令在同一 SQLite 写事务中读 receipt、校验版本/归属、写状态和 receipt；
  helper 接受同一个 tx，不能偷偷回到全局连接。新增可空 requestHash 以兼容旧 receipt，
  新组织/模板/扩展 Canvas 操作必须保存规范化语义请求指纹；in-flight 也校验该指纹。
  组织 revision 纳入轻量查询。模板库使用 list ETag 和可见面板刷新。
- **Rationale**: 只依赖进程内锁不足以保护 Web 与 MCP 两个进程；状态写入后崩溃不能导致重复实例。
- **Alternatives considered**: 绕过 kernel、各 UI 自己写 SQLite、自动刷新 revision 覆盖冲突均拒绝。
  第一版新命令遇语义冲突明确返回，不自动盲重放；用户复核后用新命令重试。
- **Review resolution**: 事务化最终绑定校验还覆盖旧 Canvas 操作、所有 v4 snapshot 保存、
  undo/restore 和系统同步，避免旧入口绕过 Element 删除保护。新 envelope 要在旧随机 ID
  fallback 前条件校验；包含前置版本的指纹不允许进入自动换 revision 重试。

## R7. 模板是本地库中的定义，不是复制完整 Canvas 对象

- **Evidence**: `project_workflow_state` 当前只有表定义，没有读写服务；
  `workflows.activeTemplate` 只是 slug/title 等元信息；`canvas-workflows.ts` 只有两图混合草稿。
- **Decision**: 新增安装级本地 `workflow_template` 表，严格白名单保存文字/生成步骤、配置、
  引用顺序、相对布局和命名 slots。实例元数据随目标 Canvas 保存。复用同一 Project/Asset 服务。
- **Rationale**: 模板需要跨项目、独立于源项目删除而存在；实例配置已经复制并钉住模板版本，
  后续改名或删模板不会修改已实例化流程。
- **Alternatives considered**: 使用 project_workflow_state 的项目实例语义保存全局定义会造成
  生命周期与所属关系混乱；第一版保留该未接通表，不建重复模板权威。
- **Capture**: 严格白名单，外部媒体/Element 转 slot；不保存媒体标识、URL 字段、路径字段、
  输出、任务/上传标识、凭据或任意 provider 参数。可编辑正文中的 URL/路径只视为文字，在预览
  中可见，不自动转换为输入或执行；模板不读取系统秘密。捕获有循环的内部流程时明确拒绝。

## R8. 不完整模板是可编辑草稿，生成有服务端阻塞

- **Evidence**: MCP 的 asset 卡必须有真实项目 assetId；`generation-providers/submit.ts`
  的完整 preflight 可能要求 provider 已配置，不能用它阻断本地模板组织。
- **Decision**: 未绑定槽存在 typed instance metadata，通过显示占位呈现，不能伪装为 asset 卡。
  实例化只检查 catalog/capabilities 并显示模型警告；所有生成入口在 preflight 和 submit 两处
  检查 sourceCardId 对应实例的必填槽。真正生成仍走既有 precheck/confirm/submit。
- **Rationale**: 仅删掉未绑定输入可能把参考生成悄悄变成纯文本生成；缺 provider key 不应妨碍搭流程。
- **Alternatives considered**: 用假媒体节点、笔记节点替代输入或实例化后自动运行均拒绝。
- **Review resolution**: 既有 Canvas 节点的 UI/MCP 生成必须全程带 sourceCardId，并把来源与
  已审核配置/绑定摘要写入 intent；缺省来源只允许明确独立的 Studio/legacy 新生成。

## R9. 时间线采用从唯一 Timeline 事实来源读取

- **Evidence**: `timeline-document.ts:getTimelineClipSource` 根据 activeTakeId 返回实际素材与
  源区间；只读 clip.assetId 会把原素材误报为当前采用。
- **Decision**: 使用此 helper 生成 timeline usage，返回 track/clip、actual asset/take、
  timeline start/duration、源区间、隐藏/静音状态和 timeline revision；不持久化另一套采用清单。
- **Rationale**: 一个镜头可能采用多个结果，组的单个展示结果不得冒充全部剪辑采用。

## R10. 独立演示与可执行验证

- **Evidence**: `scripts/start-e2e.mjs` 已用临时 BEATDESIGN_DATA_DIR 与 3042/3043 隔离 Web/MCP。
- **Decision**: 确定性 140 卡示例（八镜各 17 卡 + 四张支持卡）使用合成媒体、旧 take 和非零
  源区间；不复制真实影片。开发预览使用新的任务目录与显式端口，端口被占用时退出，不接管服务。
  在 Windows 下原 E2E pnpm spawn 路径需先做最小适配验证，不能把 shell 可用当成 runner 可用。
- **Validation**: 分别验目录去重/分页、v3→v4 往返、显示投影、旧 take、并发/崩溃注入、
  UI/MCP 一致、双语键盘操作，以及组织全过程 generation/upload/provider 调用计数为零。

## Resolution

全部设计未知项已作明确取舍；没有待用户补充的产品范围问题。
这些结论还不是实现或运行验证；后续由 plan 审核、tasks 和实现阶段证明。
