# AISpur 产品流程与跨平台审计

日期：2026-08-24

## 结论摘要

本轮已闭合三个高风险工程断点：

- 托盘左键、托盘菜单、`open_settings` 和 macOS Dock `Reopen` 现在共用同一个设置窗口呈现路径。
- 快捷键支持主键盘数字、小键盘数字、F1-F24、导航键和稳定标点；`Cmd/Ctrl + Shift + 数字` 会生成 canonical accelerator。
- 快捷键重绑定改为事务式：新组合及 Shift companion 完整注册后才保存；注册或持久化失败会清理新组合并保留旧组合。

Windows 真实运行验证未完成：当前环境只有 `aarch64-apple-darwin` Rust target，`x86_64-pc-windows-msvc` 检查因缺少 `std/core` 失败。因此本文把源码审计结果和真实平台结果分开记录。

## 验证证据

| 检查 | 命令 | 结果 |
|---|---|---|
| 前端单测 | `pnpm test` | 通过，50 个文件 / 475 个测试 |
| TypeScript | `pnpm typecheck` | 通过 |
| 前端生产构建 | `pnpm build` | 通过；Vite 提示既有大 chunk 警告 |
| Rust 格式 | `cargo fmt --check` | 通过 |
| Rust 静态检查 | `cargo clippy --all-targets --all-features -- -D warnings` | 通过 |
| Rust 单测 | `cargo test --lib` | 通过，73 个测试 |
| Rust 集成测试 | `cargo test --test trigger_chain` | 通过，5 个测试 |
| Windows target | `cargo check --target x86_64-pc-windows-msvc` | 未通过：target 未安装，`can't find crate for std/core` |
| WebdriverIO | `pnpm exec wdio run wdio.conf.ts` | 未执行：缺少 `@wdio/local-runner` / `wdio-local-runner` |

## 流程闭环

### 1. 首次启动

状态：**已覆盖（代码和前端测试）**。

- Rust 启动时加载/迁移配置，失败回退默认值并保留托盘。
- 首次启动进入 onboarding；快捷键录制复用同一冲突检查；完成时立即持久化。
- 快捷键冲突现在覆盖主组合和 Shift companion。

仍需真实平台手测：Accessibility/输入权限拒绝时的用户可见引导；目前只会在宏发送初始化失败时降级为 Fake sender 日志。

### 2. 日常触发

状态：**已覆盖（Rust/TS 单测 + 既有 E2E 后门）**。

- 全局快捷键显示、录制、冲突提示和 Shift 彩蛋路径已有组件/单元覆盖。
- `Cmd/Ctrl + Shift + number` 通过 `KeyboardEvent.code` 规范化为同一存储值。
- 再次按快捷键会隐藏 overlay；托盘左键用于打开设置，符合双轨产品定位。

仍需真实平台手测：macOS Dock Reopen 的 AppKit 事件、Windows 任务栏激活、Linux/Wayland 托盘行为。

### 3. 宏发送

状态：**部分覆盖，存在 P0 安全缺口**。

- Rust 集成测试确认 `Ctrl+C -> phrase -> Enter` 顺序。
- macOS 会检查前台应用及光标下窗口是否为安全终端。
- Windows/Linux 的 `active_app_is_safe()` 当前直接返回 `true`，因此非终端前台窗口也可能收到合成输入。这不满足跨平台安全闭环，必须在 Windows 真实平台补充前台进程/窗口白名单检查后才能发布。

### 4. 设置持久化

状态：**快捷键路径已闭合；常规配置已有覆盖**。

- 快捷键改变时，新集合注册成功后才落盘；失败会回滚 OS 注册和内存状态。
- 相同快捷键的普通配置编辑继续走原子配置保存。
- Rust `config-updated` 事件让设置窗口同步使用次数和皮肤等后台变更。

仍需补强：磁盘写入成功但后续旧组合注销失败时的诊断提示；目前按设计保留新组合并记录 best-effort cleanup。

### 5. 退出与恢复

状态：**入口路径已覆盖，产品策略有明确取舍**。

- 关闭 settings 只隐藏窗口，不退出托盘进程。
- macOS Dock Reopen、托盘左键、托盘菜单和 `open_settings` 统一呈现同一窗口。
- Windows 设置窗口未设置 `skipTaskbar`，显示/最小化时可由任务栏恢复。

当前策略是“托盘常驻”：关闭 settings 后 macOS 回到 accessory，Dock 图标消失；Windows 隐藏窗口后任务栏入口也不会保持。这避免常驻应用污染 Dock/任务栏，但用户若希望关闭后仍从 Dock/任务栏点击，需要新增“保持主窗口入口”的设置策略。建议列为 P1，不在本轮隐式改变。

## 优化建议

### P0：发布前必须处理

1. Windows 前台应用安全识别：实现并测试 Windows 前台窗口进程名/类型白名单；不能继续让非 macOS 分支无条件返回安全。
2. 输入权限闭环：检测 enigo 初始化/发送权限失败，给设置页可操作的系统权限说明和重试入口，而不是只写 stderr。
3. 补齐真实平台 E2E：Windows 托盘、任务栏恢复、`Ctrl/Cmd+Shift+数字` 注册和宏安全门禁必须在 Windows runner 实测。

### P1：高频可用性

1. 增加“保持窗口入口”策略：用户可选择关闭后最小化到任务栏/Dock，或继续纯托盘模式。
2. 把当前 `pnpm exec wdio ...` 固化为 `test:e2e` script，并补齐 `@wdio/local-runner` 依赖/配置，避免测试入口失效。
3. 冲突提示增加“当前组合/Shift companion 哪一个冲突”的明确字段，并提供一次点击回滚到上一个有效组合。
4. 宏发送失败后在 overlay 或设置页显示可恢复状态；目前用户可能只看到命令拒绝而不知道原因。

### P2：体验与维护

1. Vite 生产构建的 `three-effects` chunk 已超过 500 kB，应按特效族动态分包，降低首屏设置加载成本。
2. 清理现有组件测试中的 React `act(...)` 警告，避免真实回归被测试噪声掩盖。
3. 将平台能力矩阵写入发布流水线，区分“源码 cfg 编译通过”和“真实桌面行为通过”。

## 结论

当前 macOS/host 代码路径已完成本轮要求的窗口入口、快捷键扩展和冲突回滚改造，且 host 自动化验证通过。Windows 兼容性不能标记为完成：编译 target 和真实桌面环境均不可用，且源码中存在非 macOS 安全识别缺口。发布前应优先处理 P0 项，再进行 Windows runner 的完整旅程验证。
