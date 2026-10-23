# Higgsfield 项目工作台实测

2026-10-23 深夜（北京时间），使用用户已登录的 Chrome。公共入口为
[Cinematic video generator](https://higgsfield.ai/cinematic-video-generator)，进入 Generate 后查看已有测试项目 StoryBoard With Elements。
没有上传、生成、发布、变更账号设置或创建文件夹。私人项目 URL 不入库。

| 文件 | 实际内容和限制 |
|---|---|
| 01-home.jpg | Home 初始加载画面，局部截取，不作为完整主页布局证据 |
| 02-project-workspace.jpg | 项目工作台：左侧项目导航、主内容素材流、底部生成输入区 |
| 03-project-brief.jpg | Project brief 全页文档，含 Context、Narrative、Visuals、Production、Status、Resources、Notes |
| 05-new-folder.jpg | Add folder 弹窗：名称、描述、颜色；查看后关闭，未提交 |

Elements 已实际打开并通过页面可访问性树确认：All / Characters / Locations / Props，搜索、Filter、View、Import、Add new，右侧 Folders / Active / Drafts。该页截图超时，未把文字核验说成截图证据。

Canvas 已实际点击：项目工作台可嵌入 Canvas，侧栏缩为图标，提供 Expand canvas to full view 与 Close canvas and return to feed。本轮未核实展开后的具体页面；嵌入态截图也超时。不能将它描述成只支持独立画布页面。

项目侧栏实际含 Back、项目名称及更多、Project brief、Settings、Elements、Tools（Canvas / Chat / AI Director）、Folders（All assets / Add folder）、Trash。这里只确认入口及上述打开的页面，不推断未打开的 Settings 或云端功能行为。

原始截图及 SHA-256 见 manifest.json。BeatDesign 的实现映射和差异见 [验证回执](../../../../specs/002-series-scenes-shared-assets/project-workspace-verification.md)。
