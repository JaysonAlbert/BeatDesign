# 002 隔离验证与预览

2026-10-21需求和技术方案已获批准。实际检查结果见 [verification.md](verification.md)；本页提供复现入口。生产3020/3031、旧001预览3050/3051及真实影片库均不在本轮操作范围。

## 自动检查

在 `D:/Projects/BeatDesign-worktrees/canvas-project-organization` 执行，复用已安装依赖，不运行安装或替换共享node_modules：

```powershell
node node_modules/typescript/bin/tsc --noEmit
node scripts/run-tests.mjs
node scripts/check-i18n.mjs
node --import tsx scripts/prepare-paraglide.ts
$env:BEATDESIGN_BUILD_OUTPUT_DIR = "$PWD/data/series-build-output"
node node_modules/vite/bin/vite.js build
node scripts/sanitize-output.mjs
node node_modules/@playwright/test/cli.js test
```

若机器FFmpeg不在PATH，应设置 `BEATDESIGN_FFMPEG` 和 `BEATDESIGN_FFPROBE` 为已验证的工具路径；未配置时必须如实报告解码用例skip，不得当成已验证。构建可用独立输出目录，避免覆盖正在运行的旧预览；默认输出行为不变。

E2E自动创建临时独立SQLite，运行001及002合成seed，启动Web3042/MCP3043。端口占用即退出，不能停用户服务。测试结束关闭自己的进程并清理自己的临时目录。

## 新建持久预览

仅向新的隔离目录seed一次，已有目录先检查manifest，不能覆盖数据库。先确认3060/3061空闲。

```powershell
$env:BEATDESIGN_DATA_DIR = "$PWD/data/series-preview-20261021"
New-Item -ItemType Directory -Force $env:BEATDESIGN_DATA_DIR
node node_modules/drizzle-kit/bin.cjs push --force
node --import tsx scripts/seed-organization-fixture.ts
node --import tsx scripts/seed-series-fixture.ts
$env:HOST = '127.0.0.1'
$env:PORT = '3060'
node data/series-build-output/server/index.mjs
```

另一个终端使用同一数据目录启动MCP，设置 `BEATDESIGN_WORKSPACE_URL=http://127.0.0.1:3060` 以确保handoff保持在预览实例，设置 `BEATDESIGN_MCP_HTTP_HOST=127.0.0.1`、`BEATDESIGN_MCP_HTTP_PORT=3061` 和随机测试 `BEATDESIGN_MCP_TOKEN` 后运行 `node --import tsx scripts/mcp-server.ts --http`。token不放入Git或截图。后台启动须隐藏窗口并记录自己的PID和日志。

- 中文总览：`http://127.0.0.1:3060/zh/series/synthetic-series-002`。
- `series-fixture.json`记录12集/240场ID、5,978场次卡+22默认引用卡=6,000卡、2,000素材ID与SHA256；前六个场次各100卡。
- `organization-fixture.json`为另一个独立001项目，保留140卡、505素材、声音、旧take和真实区间样例。总测试库多于2,000素材，但002本集范围恰为2,000，范围计数不能与全库混淆。
- 合成媒体为代码创建的小图/静音及仓库tiny-black测试片段；没有模型作业或真实影片导入。

## 四故事复核

1. 从剧集总览进入分集，打开“分集与场次”，选择场次。检查四工作区、刷新/后退及同名场次身份；旧URL仍进入默认项目画布。
2. 一场仅加载一份正文。创建第二画布，显式选择节点并预览完整依赖后转移；有未过期intent/运行状态、容量、目标冲突时整批拒绝。定位旧节点为临时视图，退出不落库。
3. 共享人物有v1/v2和20个固定v1消费者，推荐v2不会自动采用。选择3个预览并确认后恰好3个更新；旧参考卡、历史、剪辑不变。归档、保留、采用、本地化和脱离均可单独验证。
4. 素材板切本场/本集/共享，媒体、参考类型、目录与用途筛选及分页。详情分开显示同批、同一步骤历史、固定版本、消费者和本集剪辑区间。共享发布与用于本集是独立动作，归档先预览并可恢复。

技术通过、人类视觉验收、合入、部署及真实迁移分别记录。没有真实生产任务授权；不要移除production.pause或替换正式母版。
