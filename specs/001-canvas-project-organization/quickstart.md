# Quickstart: 实现后的独立验证

本页是实现后的复现指南；实际执行结果见 [verification.md](verification.md)。
不要把真实影片或主 data/ 作为测试输入。

## 1. 环境与边界

- 当前 worktree：`D:/Projects/BeatDesign-worktrees/canvas-project-organization`。
- Node >=22、pnpm >=10；确认本 worktree 使用独立依赖，或已有只读共享依赖时避免触发重装。
- 迁移与验证的数据库必须来自新建目录或合成旧版本 fixture。
- 主实例 3020/3031 保持原状。现有 E2E 使用临时数据和 3042/3043；
  人工开发预览拟使用 3050/3051，若占用则退出，不停止或复用陌生服务。
- 无需配置 provider key，不能提交生成任务。媒体用合成小文件，服务端计数必须为零。

## 2. 自动检查

在特性 worktree 中，准备依赖与生成的 schema/Paraglide 后执行现有命令：

```powershell
pnpm typecheck
pnpm test
pnpm i18n:check
pnpm build
pnpm test:e2e
```

全新 checkout 的准备命令为 `pnpm install --frozen-lockfile`、`pnpm db:push`，
后者必须先设置指向隔离目录的 BEATDESIGN_DATA_DIR。已有共享 node_modules 时不要运行
会改写它的安装命令；按仓库既有说明用现有 Node 工具直接执行检查。
原 `scripts/start-e2e.mjs` 在 Windows 的子进程启动需在实现阶段覆盖，再执行 E2E。

预期：共置测试覆盖纯操作、严格 schema、投影、持久化和多进程竞态；E2E 覆盖新组织入口。
已有共置领域/持久化测试和 organization.spec.ts；不能仅运行旧测试就宣布新功能通过。

## 3. 合成 fixture 与人工预览

实现阶段新增确定性 fixture helper，输出 manifest 和可验证快照，不含真实影片数据：

- 八个镜头，每镜 17 张卡，加四张支持卡，总共 140 张。
- 同一 Asset 多 category membership，超过 500 条的分页素材组，以及两份 Element 版本。
- 单独的草稿模板和目标项目；另一项目的媒体只用于跨项目拒绝反例。
- Timeline 采用一个较旧 take，源区间非零；另有 activeTakeId 用于真实来源检查。
- 全部使用合成小媒体和无 provider 任务的输出记录；记录文件哈希、Card ID 和引用快照。

人工预览沿用现有可执行入口，在独立终端中准备环境：

```powershell
Set-Location D:/Projects/BeatDesign-worktrees/canvas-project-organization
$env:BEATDESIGN_DATA_DIR = 'D:/Projects/BeatDesign-worktrees/canvas-project-organization/data/organization-preview'
$env:BEATDESIGN_MCP_HTTP_PORT = '3051'
$env:BEATDESIGN_MCP_TOKEN = [guid]::NewGuid().ToString('N')
if (Get-NetTCPConnection -State Listen -LocalPort 3050,3051 -ErrorAction SilentlyContinue) {
    throw 'Preview port occupied; choose an explicitly isolated free pair.'
}
pnpm db:push
pnpm exec tsx scripts/prepare-paraglide.ts
pnpm exec vite dev --host 127.0.0.1 --port 3050 --strictPort
```

MCP 使用相同环境和值在另一个本任务终端运行 `pnpm exec tsx scripts/mcp-server.ts --http`。
不得把 token 打印到回执、提交到 Git 或复制生产配置。此处端口是拟议预览值，非已运行实例。
建表后执行 `node --import tsx scripts/seed-organization-fixture.ts`。
脚本强制显式隔离数据目录，写入 `organization-fixture.json` manifest 并输出合成项目 ID。
Windows 已有 Chrome 时 E2E 自动使用独立测试配置，无需更换用户浏览器登录会话。

## 4. 用户故事验证

### P1：总览、下钻和真实采用

1. 对合成项目明确应用八个镜头组与四个支持入口，折叠后可见入口不超过十二个。
2. 展开任意组，三次操作内定位主要构图、生成配置和实际采用片段；切换当前链/所有版本。
3. 移动/缩放折叠或展开组、撤销/重做、重载；resize 仅改框，隐藏成员 frames 不丢失。
4. 解除一个组，全部成员和媒体仍在。生成期间的后续输出不会因 undo 被删除。
5. 核对 timeline usage 等于 getTimelineClipSource，而非父节点最新结果或原 clip.assetId。
6. 旧 output 引用在 restore 和 display endpoint 聚合后逐项一致。
7. 删除组指定结果或实例/Element 消费节点，确认 resultCardId、绑定、step/slot 同时清理；
   必填输入删除后恢复生成阻塞，没有悬空元数据。

### P2：目录与 Element

1. 建两层目录，批量归类多份素材；同一 Asset 多 category 只显示一份。
2. 在当前目录、未分类、全项目搜索中切换，连续分页找到 500 条之后的素材。
3. 非空目录移除先预览；确认后素材/子目录提升，文件哈希、Asset ID 和剪辑不变。
4. 循环、过深、重名、跨项目 Asset 和过期影响预览均被拒绝。
5. 两个镜头绑定同一 Element 固定版本；切换当前版本后均标记待复核。
6. 分别测试保留旧版、显式采用新版；原生成输入、旧 take 与 Timeline JSON 不变。
7. 有使用者的 Element 不能移除；Web/MCP 两进程竞争绑定/移除不得留下悬空。

### P3：模板

1. 保存前预览白名单，源媒体转槽，定义无 asset/task/output/credential 等禁止结构字段。
2. 实例化两次得到独立稳定 ID；重试同一请求只得到原实例，同键不同内容拒绝。
3. 在另一项目只给源项目 ID 必须拒绝；显式绑定目标项目素材后可用。
4. 缺少必填槽时仍可编辑，但 UI 和 MCP 的生成 preflight/submit 都阻塞。
   Canvas 请求缺 sourceCardId、或绑定变更后使用旧 intent 同样拒绝；独立 Studio 新生成仍兼容。
5. 模型不可用给替换提示；没有 key 仍能保存/实例化，不创建上传 intent 或 generation。
6. 超过 200 卡/2 MiB 或单模板限额时整批回滚；删模板不影响已建实例。

## 5. 事务、旧项目和 UI/MCP

- 在状态保存与 receipt 写入间注入故障，断言两者同时回滚；复跑只产生一份状态。
- receipt 过期后重发同一实例请求，稳定 ID/requestHash 仍防重复；异内容同 ID 明确拒绝。
- v3/旧数据库读写回归；首次读取不自动回写、整理、移除媒体或改取用片段。
- 旧客户端 replacement 不能抹掉 v4 组织；未知未来 schemaVersion 直接拒绝。
- MCP 修改 → UI revision 检查 → 可见组织更新；未保存表单保留并提示冲突。
- 旧 upsert/set_references/remove_card、undo/restore、snapshot 保存与 Element 删除竞争时，
  同样进行事务内绑定校验，不能通过旧写入口产生悬空。
- 新操作省略 commandId/key/revision 时须在随机 ID fallback 前拒绝；旧纯 legacy 请求保留兼容。
  新操作不能被原冲突包装器自动刷新 revision 重放。
- 英文和中文，键盘创建/重命名/展开/定位/归类/绑定/模板操作均可完成。
- 对所有组织场景断言生成、上传、provider 调用计数为零，不能只用“没有可见视频”判断。

## 5a. 追加：组容器与排列

1. 使用八镜合成示例，打开“组织画布”，点击“展开并整理全部组”，再适配全部节点。
2. 确认八组同时展开；组标题、节点和 Take 条均在各自容器内，组间不重叠。
3. 对一个组执行竖排并撤销，确认 canonical frames 恢复；刷新后仍保留已保存布局。
4. 勾选两个组执行组间竖排，确认未选组、独立素材保持原位，且所选组避开它们。
5. 拖动组标题后确认可见成员及隐藏历史统一平移；撤销恢复全部原坐标。
6. 从 MCP 执行 layout_group / fit_group / arrange_groups 并重新读取，确认相同布局与版本规则；生成、上传调用为零。

## 6. 记录交付证据

记录 commit、隔离数据目录、端口、fixture manifest、自动检查摘要、UI/MCP 截图、
覆盖与未覆盖项。分开记录源码、自动检查、浏览器、MCP-to-UI、人审、合入和部署。
只对技术行为作结论，不将本示例视为真实影片的创作验收或默认整理授权。
