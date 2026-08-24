# AISpur 跨平台窗口呈现与快捷键闭环设计

日期：2026-08-24

## 目标

本设计处理四个直接工程目标，并以产品流程审计作为交付物：

1. 点击 macOS Dock、Windows 任务栏或系统托盘左键时，打开并聚焦 AISpur 设置窗口。
2. 快捷键录制、冲突检测、保存重绑定和启动注册形成一致闭环。
3. 支持 `Cmd/Ctrl + Shift + 数字` 以及更多常见可解析组合。
4. 审计 Windows 条件编译、输入合成、托盘、窗口生命周期和资源配置。
5. 评估首次启动到退出的产品流程，按优先级记录剩余优化项。

## 现状与根因

- 托盘左键在 `tray.rs` 直接显示 settings；`open_settings`、托盘菜单和 Dock 重开没有共享入口。
- Tauri 的 macOS `RunEvent::Reopen` 尚未处理，因此 Dock 点击无法可靠恢复隐藏窗口。
- `check_conflict` 用临时注册探测单个组合；保存配置前会先 `unregister_all`，新组合注册失败会留下“配置已保存但快捷键失效”的状态。
- 前端使用 `event.key` 解析，未利用 `event.code` 区分主键盘数字和数字小键盘，且 token 支持范围与 `global-hotkey` 的 `Code` 不完整对齐。
- Shift 彩蛋会额外注册 companion 组合，冲突探测和重绑定必须同时考虑主组合与 companion。

## 方案

采用“统一窗口呈现 helper + 快捷键事务式重绑定”。不引入新插件、不改变 Config 版本，不拆分为多动作快捷键配置。

### 窗口呈现

在 Rust 中提供单一的 `present_settings_window(app)` 内部 helper，负责：

- macOS 设置为 `ActivationPolicy::Regular`；其他平台不调用该 API。
- `show`、`unminimize`、`set_focus`，每一步错误都转成可诊断日志或命令错误。
- 托盘左键、托盘菜单、`open_settings` 命令复用 helper。
- 应用运行循环处理 macOS `RunEvent::Reopen`，无论 settings 是否可见都调用 helper。
- settings 关闭请求仍然只隐藏窗口；再次从 Dock/托盘打开时恢复同一窗口。

Windows 不伪造 macOS Dock 事件。settings 窗口保持普通任务栏窗口（不设置 `skipTaskbar`），任务栏激活由窗口系统处理；托盘左键和菜单明确调用同一 helper。

### 快捷键规范化

前端录制器输出 canonical accelerator：

- 修饰键固定顺序：`CommandOrControl`、`Alt`、`Shift`。
- 使用 `KeyboardEvent.code` 优先识别 `KeyA..KeyZ`、`Digit0..Digit9`、`Numpad0..Numpad9`、`F1..F24`。
- 支持 `Tab`、`Enter`、`Escape`、`Space`、方向键、`Home`、`End`、`PageUp`、`PageDown`、`Insert`、`Delete` 等跨平台稳定 token。
- 标点只在浏览器提供明确 `code` 且能映射到 Tauri parser 时接受；未知键返回 `null` 并继续录制。
- 仅修饰键和无修饰键被拒绝，避免全局劫持正常输入。
- 主键盘数字和小键盘数字统一为 `0..9`，确保 `Cmd/Ctrl+Shift+5` 在三平台使用相同存储值。

Rust 端保留最终格式校验，并对输入做 trim、空 token、重复修饰键和缺失主键检查。所有冲突比较使用 canonical 字符串及解析后的 `Shortcut` id，避免大小写和别名造成绕过。

### 冲突探测与事务式重绑定

快捷键集合定义为：主组合，以及主组合不含 Shift 时生成的 Shift companion。冲突检查步骤：

1. 规范化并校验候选组合。
2. 如果候选属于当前应用已注册集合，报告无外部冲突。
3. 逐个 probe 候选集合；probe 成功后立即注销，失败则返回冲突组合和去重后的建议。
4. 建议沿用最后一个主键的邻近替换，但数字、F 键和字母分别使用有效范围。

重绑定步骤：

1. 记录当前有效组合集合。
2. 注册新主组合；必要时注册新 companion。
3. 新集合完整成功后保存 Config。
4. 保存成功后注销旧集合（旧集合与新集合相同的成员不重复操作）。
5. 任一步失败，注销已注册的新成员并恢复旧集合；Config 和 UI 保持旧值。

启动注册失败时保留托盘和设置可用，并在设置页显示当前组合不可用的错误，而不是静默保存一个死快捷键。

### Windows 审计边界

- `target_window.rs` 的 macOS 专用窗口枚举与激活逻辑必须由 `cfg(target_os = "macos")` 隔离；Windows 走安全终端进程名和前台窗口路径。
- `macro_sender.rs` 只通过 enigo 0.6 的跨平台 API，不引入 Win32 deprecated API；验证 Ctrl+C、文本输入、Enter 的调用序列。
- 托盘检查左键、右键菜单和 Windows-only double-click，不让双击重复打开或触发退出。
- 资源路径使用 Tauri `resource_dir` / `app_data_dir`，不依赖 macOS bundle 路径。
- 运行 `cargo check --target x86_64-pc-windows-msvc`；若本机缺少 Windows target/linker，记录为环境限制并通过源码审计和可编译的 host 单元测试覆盖。

## 测试策略

先写失败测试，再实现：

- Rust：窗口呈现入口的纯逻辑/调用契约、canonical 校验、数字/F 键建议、主组合 + companion 冲突集合、重绑定失败回滚。
- TypeScript：主键盘数字、小键盘数字、`Cmd/Ctrl+Shift+数字`、导航键、未知键、格式化显示和录制器冲突/错误状态。
- E2E：托盘点击后 settings 可见且聚焦；macOS Dock Reopen 通过运行事件路径验证；重绑定失败后旧快捷键仍可触发。
- 完整验证：`pnpm test`、`pnpm typecheck`、`cargo fmt --check`、`cargo test`、`cargo clippy -- -D warnings`、Windows target check，以及可用环境下的 E2E。

## 产品流程评估输出

实现后按以下阶段逐项记录证据：

1. 首次启动：读取配置、快捷键冲突、引导完成和跳过。
2. 日常触发：快捷键、Shift 彩蛋、托盘/窗口入口、动画结束。
3. 宏发送：安全终端识别、权限失败、提示词为空、发送成功反馈。
4. 设置持久化：修改、保存失败、重启恢复、Rust 侧更新同步。
5. 退出与恢复：关闭 settings 只隐藏、Dock/任务栏/托盘重新打开、退出菜单真正退出。

报告将剩余问题按 P0（阻断闭环）、P1（高频可用性）、P2（体验和维护）分类，不把无法在当前 macOS 机器实测的 Windows 行为标记为已验证。

## 非目标

- 本轮不新增独立的“设置快捷键”或多动作快捷键配置。
- 不改变动画、素材包和 Config v3 数据模型。
- 不重写现有窗口视觉样式；只添加必要的状态文案和测试钩子。
