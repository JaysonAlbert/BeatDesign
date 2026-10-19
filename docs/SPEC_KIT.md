# Spec Kit 开发入口

本分支使用 Specify CLI 1.2.2、Codex skills 集成、PowerShell 脚本。
CLI 按官方标签 `v1.2.2` 从源码安装；版本对应源码提交
`74be0a63e93c7087c5b06556b7561810d8f78a45`。

```powershell
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@v1.2.2
specify version
```

已有项目的初始化命令，仅在没有 `.specify/` 的独立分支中执行：

```powershell
specify init --here --force --non-interactive --integration codex --integration-options="--skills" --script ps --ignore-agent-tools
```

`--force` 用于承认非空目录合并；不要用它覆盖已定制的 Spec Kit 文件。
使用已生成的本地 `.agents/skills/speckit-*/SKILL.md`，不要把技能名当作 shell 命令。
Git 只放行这些官方技能目录；其他 `.agents/` 内容继续忽略。

## 当前特性

- 分支：`codex/canvas-project-organization`。
- [项目原则](../.specify/memory/constitution.md)：1.0.0，整理既有产品约束。
- [需求规格](../specs/001-canvas-project-organization/spec.md)：四条用户故事、23 项需求。
- [质量检查](../specs/001-canvas-project-organization/checklists/requirements.md)：文档检查通过。
- `.specify/feature.json` 保存本 worktree 的特性目录，按官方规则忽略，不进入 Git。
  新 checkout 可显式设置 `$env:SPECIFY_FEATURE_DIRECTORY = 'specs/001-canvas-project-organization'`。
- `.gitattributes` 为官方技能和 `.specify/` 保留 LF，防止 Windows checkout 改变安装哈希。

## 默认流程与审核点

1. `$speckit-constitution`：读取既有规则，形成项目原则。
2. `$speckit-specify`：整理用户需求和可验证结果。
3. `review-spec`：用户审核需求；当前尚未批准。
4. `$speckit-plan`：研究、技术方案、数据模型、接口约定、验证指南。
5. `review-plan`：用户审核技术方案。
6. `$speckit-tasks`：按用户故事拆解可执行任务。
7. `$speckit-analyze`：检查规范、方案和任务的一致性。
8. `$speckit-implement`：按任务实现并验证。
9. `$speckit-converge`：核对剩余差距，准确记录完成状态。

官方默认审核点见 `.specify/workflows/speckit/workflow.yml`。用户明确授权跳过某个
审核点时记录原话与范围；没有回复不能视为批准。Spec Kit 是流程工具，不能自动
运行模型、迁移影片、替换已采用 take 或批准部署。

## 当前状态

安装、初始化、项目原则和需求规格已完成；当前为 `review-spec`。
未生成技术方案、任务清单或应用实现，未改动主实例或真实影片。
用户批准需求后进入 plan；计划审核通过后才进入 tasks 和 implement。

此安装不更改全局 Codex 设置；新会话从本 worktree 打开项目时使用项目技能。
