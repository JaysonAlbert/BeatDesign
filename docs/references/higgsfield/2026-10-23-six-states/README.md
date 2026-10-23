# Higgsfield Canvas 六种状态实测

采集：2026-10-23，北京时间。Chrome 已有登录会话；入口为 [Canvas](https://higgsfield.ai/canvas) 和 [StoryBoard With Elements 官方模板](https://higgsfield.ai/canvas/templates/7b1af334-cffd-4584-8d97-99f6a9a0513b)。本批独立于此前截图，不覆盖历史。

前五种主要使用既有 Canvas group behavior test 测试画布。公开模板只读模式未开放完整节点操作，因此通过 Add 建立了一个同名官方模板测试副本，检查现成媒体和视频设置。未上传用户素材、未点击 Run/Generate/Regenerate、未修改提示词或模型参数；测试副本保留。账号专属 URL 不归档。

| 状态 | 实际截图 | 观察到的布局与设置 | 新方案采用 |
|---|---|---|---|
| 未选择 | [01](01-unselected.png) | 画布铺满；左上标题菜单，右上协作入口；底部居中工具条，左下缩放；没有展开的设置栏 | 默认关闭导航/设置，画布优先；保留 BeatDesign 工作区切换 |
| 选中节点 | [02](02-selected-node.png) | 蓝色选框和输入/输出端口；卡片底部直接编辑提示词；模型和运行按钮同排；分辨率、画幅为快捷入口 | 节点内编辑，不再默认打开三标签详情栏 |
| 选中组 | [03](03-selected-group.png) | 组上方浮动 Run all、颜色、Ungroup、Row/排列、下载、删除、锁定；运行有费用提示 | 排列/取消编组/下载等局部操作贴近组；运行另经任务预检 |
| 生成设置 | [04](04-generation-settings.png)、[视频设置](04b-video-settings.png)、[模型选择](04c-model-picker.png) | 点击快捷参数打开右上浮动设置卡；提示词和参考在顶端；模型选择行；图片有分辨率/画幅/批量/高级设置；视频有时长/分辨率/画幅/批量/音频开关；底部生成 | 对齐顺序与弹出位置；字段由 BeatDesign 模型能力决定，不能照抄竞品枚举或价格 |
| 参考选择 | [来源菜单](05-reference-source.png)、[素材选择器](05b-reference-picker.png) | 图片输入端口打开 Image Generation / Upload / Assets；Assets 就近展开选择器，分来源和媒体类型；设置卡顶部 + 是添加参考入口 | 同位置的来源菜单与素材选择器；来源改成本集/共享/上传 |
| 查看结果 | [节点历史](06-result-history.png)、[展开图库](06b-result-gallery.png) | 结果在节点内，底部历史缩略图，图库在节点位置展开；有全屏、下载、删除等入口 | 节点历史与展开图库；剪辑固定资产、画布显示版本保持区分 |

## 限制与不确定性

- `01` 是适配内容后的无局部工具栏状态。组的蓝色区域本身不等于选中；`03` 有控制柄与 Group actions 工具栏。
- Full view 已点击，模板继承结果出现包含 “may not have access to it” 的提示，未成功进入独立全屏结果页。因此不能用本批截图声称全屏页布局已核实；结果卡与图库已实际打开。
- 图像设置的 Add reference image 点击后未出现网页内素材库，不把此入口等同于 Assets picker；素材库证据来自输入端口 → Assets。
- 视频时长截图显示 10，辅助树 slider Value 为 6；不从这个差异推导范围或最终提交值。没有调整或提交参数。
- 模型菜单展示的型号、分辨率与时长是当日 Higgsfield 界面信息，不代表 BeatDesign 支持范围。
- 未运行付费生成，不证明批量调度、排列执行、锁定、下载、删除、参数保存或参考绑定成功。
- 原始 PNG 保留；采集时间见 capture-times.json，哈希见 capture-index.json。
