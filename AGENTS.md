<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->



## 编码约束（Windows + PowerShell 环境）

- 所有文本文件必须使用 UTF-8（推荐无 BOM）。
- PowerShell 读写必须显式指定编码：`Get-Content -Encoding UTF8`、`Set-Content -Encoding UTF8`、`Out-File -Encoding UTF8`；禁止使用默认编码或裸重定向覆盖文件。
- 如需在脚本中统一编码，可在开头执行 `chcp 65001` 或在运行命令时加上 `-Encoding UTF8`。
- IDE/编辑器保存、代码生成脚本输出时一律设为 UTF-8，避免使用系统默认代码页。
