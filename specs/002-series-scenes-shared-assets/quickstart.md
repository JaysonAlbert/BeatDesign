# Quickstart: 实现后的隔离验证指南

**状态**：002 未实现，本页是以后可复现的验收入口，不是已运行回执。现有 001 的用例不能证明新能力。
[合同](contracts/commands.md)规定未来工具/参数，[UI](contracts/ui.md)规定预期画面。

## 1. 前提与准备

- 审阅通过后才生成 tasks 并实现；先完成计划 A 的文档身份/source intent/兼容保护。
- 使用隔离 worktree 与独立临时数据目录，不读写真实影片库，不复用主3020/3031。
- Node>=22、pnpm>=10，复用已有依赖；共享 node_modules 不重装。端口占用退出，不能停用户服务。
- 所有 fixture 都是合成小媒体及合成历史。无需Provider凭据，网络生成/上传适配器用计数mock。
- 实现阶段新增确定性 series fixture helper，manifest记录IDs/hash/默认文档映射/版本/clip；当前没有该脚本，不给虚假的可执行seed命令。

未来fixture应含：
1. 一个完全不加入Series的旧v4项目、旧版SQLite样本、手动封面、折叠组、固定旧take及非零clip源区间。
2. 一个Series三集，每集三场；单场多文档，另一个无关Series作拒绝对照。
3. 两集20个消费者固定同一角色v1，v2独立素材；含模板槽、归档来源与缺文件反例。
4. 同集6文档各100卡，共600卡；全作品12集×20场、6,000卡，包含不打开的高容量场。
5. 2,000媒体，重复categorymembership、显式场次标签、未归场、同批两结果、多批历史；每个Asset只计一次。
6. 可控Web/MCP并发屏障、receipt提交前故障点与生成/上传mock计数。

## 2. 可沿用的真实检查入口

以下入口当前存在；只有新增002测试后才有验收意义。在准备好的隔离环境执行，不在本次设计阶段运行：

```powershell
Set-Location D:/Projects/BeatDesign-worktrees/canvas-project-organization
node node_modules/typescript/bin/tsc --noEmit
node scripts/run-tests.mjs
node scripts/check-i18n.mjs
pnpm build
pnpm test:e2e
git diff --check
```

pnpm仅用于已安装依赖的脚本，不触发安装；若现有共享依赖拒绝执行，使用仓库既有Node入口并记录实际命令，不替换依赖。E2E必须使用隔离数据库与fixture。未来预览应选择空闲端口对，例如3060/3061，BEATDESIGN_DATA_DIR指向新测试目录、MCP token仅测试进程持有；以既有start-e2e/dev-with-mcp入口核对实际参数后启动，不复制生产配置。当前3050预览仍为001，不展示002。

## 3. 独立故事验收

### V1 / US1：集、场导航

创建Series并加入三个合成Project，独立Project保持未加入；建同名场次及不同顺序。四工作区切换、刷新、前进/后退、改序/改名后深链定位正确。失效/归档场显示原因和返回入口。Editor完整时间线不因场次筛选丢片段，clip标签定位精确。

### V2 / US2：文档分区

六场600卡，打开一场只请求一份正文；其他场快照/媒体请求数为0。检查默认文档原ID/JSON与封面不变；跨文档undo不可串用。未保存冲突切场保留草稿，旧回包不覆盖新文档。搜索旧take临时展开不增加持久化revision。

转移一完整组：preview闭包明确，apply后源目标、绑定、模板、locator一致；源历史未改。缺text依赖、运行中作业、旧intent、超200卡/2MiB、目标revision竞争均整次拒绝。旧深链可到当前去向；不创建跨文档card edge。

### V3 / US3：固定版本

20个消费者固定v1，其中至少两个共用同一参考卡；发布/推荐v2后20个仍v1；明确选择3个，preview后apply恰好3个变。被选与未选共用旧卡时只对所选输入建立新引用，旧卡不覆盖。其余、history、clip、旧take不变。构造第3个目标CAS冲突，确认0更新、0membership残留、无成功receipt。相同键同参数重试返回原结果，不同canvas/目标请求拒绝。

archive/detach与bind双进程竞争；只有合法完整结果。本地化移出集后旧pin仍可读、共享发布仍存在；无关Series绑定、模板槽foreignAsset和伪造媒体URL被拒绝。缺文件保留来源并阻止生成。删除在用Asset被拒绝。

### V4 / US4：素材板

2,000素材分页找第500条之后的内容；媒体与角色/场景等正交筛选，20次快速范围切换无旧结果串入。验证准确total或明确unknown。节点同批1/2、2/2与多批历史分区；真实clip/take与源区间可追溯。只点击浏览不授予项目membership或建节点。

## 4. 共用边界与回归

- MCP新建场、组内整理、固定参考、采用 → UI正确文档revision刷新；UI写 → MCP精确返回。
- 省略canvasId的旧工具只命中默认；不同文档同名/伪造卡ID不能误提交。
- precheck/intent/submit跨文档替换、绑定变更后重用intent均失败；运行结果保持原Project/源位置。
- 故障注入在正文与receipt之间，同时回滚；双连接数据库升级不重复建表，不丢旧默认快照。
- 新schema被旧替换接口写入时明确能力错误，未知字段不截断。
- 共享媒体原origin路径不搬；本集媒体URL只在membership合法时返回；跨范围拒绝。
- 英文/中文、键盘、<960px抽屉、焦点恢复、未归场/空态/归档恢复。
- 每故事前后比对媒体hash、history、clip JSON；所有整理/浏览/共享/采用动作生成和上传mock计数为0。

## 5. 量化和记录

SC-002/004在同一Windows机器、浏览器版本、SSD合成小媒体、warm metadata cache下记录至少30次操作，以p95计算；另报告冷启动与缩略图解码，不能用服务查询耗时替代可操作时间。用网络记录证明不读全季正文/媒体。

记录commit、数据目录、manifest、命令结果、耗时分布、Web/MCP回读、截图来源/哈希与未覆盖项。分别标记源码、自动验证、浏览器、MCP、人类视觉审核、合入、部署、真实迁移。无实测不得把SC标为通过；真实影片仍需另行授权。
