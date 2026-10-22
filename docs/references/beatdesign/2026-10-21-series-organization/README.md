# BeatDesign 002 UI evidence

2026-10-21，本分支通过Playwright控制隔离Chrome，Web3042/MCP3043、独立临时SQLite；全部项目与媒体均为合成样例，无账号、密钥、真实书籍或影片。此处是本产品验证截图，**不是Higgsfield/LibTV实测证据**。竞品参考仍以002/research.md原记录为准。

- series-overview.png：12集总览。
- scene-navigation.png：场次与独立Canvas目录。
- shared-version-review.png：选择精确消费者的版本审阅。
- asset-board.png：服务端筛选后的素材板。
- narrow-en.png / narrow-zh.png：双语窄屏Canvas与导航入口。
- production-series-zh.png / production-navigation-zh.png / production-assets-zh.png：3060生产构建的中文实测。
- evidence-manifest.json：每份截图/性能记录的来源、大小与SHA256。
- canvas-switch-timings.json / asset-filter-timings.json：同机器热缓存30次样本、p95及阈值；冷启动、真实大媒体解码不计入这些数据。

来源脚本：tests/e2e/series.spec.ts。最后验证、文件hash和适用边界见 specs/002-series-scenes-shared-assets/verification.md。自动截图及Agent检查不代替用户视觉验收。
