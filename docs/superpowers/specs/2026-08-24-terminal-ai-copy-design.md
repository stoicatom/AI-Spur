# 终端 AI 兼容文案统一设计

## 目标

将 AISpur 用户可见文案从单一的 Claude Code 定位调整为面向终端 AI 工具的通用表述，明确产品可用于 Claude Code、Codex 等工具，同时避免在页面中绑定某一个实现。

## 文案策略

- 默认称谓使用“终端 AI”或“终端 AI 工具”。
- 中英文提示词管理描述分别使用“随机选择一条发送到终端 AI”和“Randomly select one to send to a terminal AI”。
- 首次引导使用“有时候终端 AI 实在太慢了。催它一下。”，英文使用等价的通用表达。
- 应用元数据描述使用面向终端 AI 的产品定位，并在必要的描述中说明兼容 Claude Code、Codex 等工具。

## 修改范围

- 修改 `src/i18n/zh-CN.json` 与 `src/i18n/en-US.json` 中的用户可见应用描述和提示词管理描述。
- 修改 `src/onboarding/steps.tsx` 中首次引导的专属产品文案。
- 修改 `src-tauri/Cargo.toml` 中展示给系统/安装器的应用描述。
- 检查托盘提示和窗口标题；若已有通用 AISpur 文案则保持不变。

## 明确保留

- `src-tauri/src/target_window.rs` 中的 `Claude Code`、`Codex` 等名称是运行时目标应用识别名单，必须保留，不能替换为展示文案。
- README、CLAUDE.md、历史设计文档和注释中的技术说明不属于当前页面文案范围，不做无关改写。

## 验证

1. 对用户界面源文件和本地化资源扫描不应再出现面向用户的 Claude Code 专属文案。
2. 保留运行时识别测试，运行 TypeScript 检查和 Rust 测试/构建检查。
3. 确认中英文 JSON 仍然可解析，应用描述和引导文本均已更新。
