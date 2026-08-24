# AISpur 产品流程与跨平台审计

日期：2026-08-24

## 结论摘要

本轮已闭合五个高风险工程断点：

- 托盘左键、托盘菜单、`open_settings` 和 macOS Dock `Reopen` 现在共用同一个设置窗口呈现路径。
- 快捷键支持主键盘数字、小键盘数字、F1-F24、导航键和稳定标点；`Cmd/Ctrl + Shift + 数字` 会生成 canonical accelerator。
- 快捷键重绑定改为事务式：新组合及 Shift companion 完整注册后才保存；注册或持久化失败会清理新组合并保留旧组合。
- 宏发送现在按完整事务互斥；运行时部分失败不会重放非幂等输入，启动时不可用后端只在完整重试成功后替换。
- 宏失败事件携带 `attemptId`，overlay 过滤迟到事件并覆盖事件监听竞态；权限入口失败仍保留可见恢复状态。
- 设置新增 `tray / persistent` 窗口入口策略；持久模式在 macOS 保留 Dock、在 Windows/Linux 最小化保留任务栏入口。
- 冲突反馈区分主组合与 Shift companion，显示实际占用组合/来源，并提供恢复上一有效组合。

Windows 真实运行验证未完成：当前环境只有 `aarch64-apple-darwin` Rust target，`x86_64-pc-windows-msvc` 检查因缺少 `std/core` 失败。因此本文把源码审计结果和真实平台结果分开记录。

## 验证证据

| 检查 | 命令 | 结果 |
|---|---|---|
| 前端单测 | `pnpm test` | 通过，52 个文件 / 513 个测试 |
| TypeScript | `pnpm typecheck` | 通过 |
| 前端生产构建 | `pnpm build` | 通过；Vite 提示既有大 chunk 警告 |
| Rust 格式 | `cargo fmt --check` | 通过 |
| Rust 静态检查 | `cargo clippy --all-targets --all-features -- -D warnings` | 通过 |
| Rust 全量测试 | `cargo test --all-targets --all-features` | 通过，206 个测试：lib 84、bin 97、集成 25 |
| Windows target | `cargo check --target x86_64-pc-windows-msvc` | 当前 macOS 主机未安装 target；Windows CI job 会在原生 runner 执行 |
| WebdriverIO E2E | `pnpm test:e2e` | 通过，8 个 spec / 14 个用例；macOS WebKit，`tauri-driver 2.0.6` |

## 流程闭环

### 1. 首次启动

状态：**已覆盖（代码和前端测试）**。

- Rust 启动时加载/迁移配置，失败回退默认值并保留托盘。
- 首次启动进入 onboarding；快捷键录制复用同一冲突检查；完成时立即持久化。
- 快捷键冲突现在覆盖主组合和 Shift companion。

仍需真实平台手测：Accessibility/输入权限拒绝时系统 API 的实际返回；代码已提供结构化错误、重试和平台诊断入口。

### 2. 日常触发

状态：**已覆盖（Rust/TS 单测 + 既有 E2E 后门）**。

- 全局快捷键显示、录制、冲突提示和 Shift 彩蛋路径已有组件/单元覆盖。
- `Cmd/Ctrl + Shift + number` 通过 `KeyboardEvent.code` 规范化为同一存储值。
- 再次按快捷键会隐藏 overlay；托盘左键用于打开设置，符合双轨产品定位。

仍需真实平台手测：macOS Dock Reopen 的 AppKit 事件、Windows 任务栏激活、Linux/Wayland 托盘行为。

### 3. 宏发送

状态：**代码和 host 测试已闭环；Windows 真实桌面验证仍是发布前 P0 门槛**。

- Rust 集成测试确认 `Ctrl+C -> phrase -> Enter` 顺序。
- macOS WebKit E2E 已覆盖宏调试后门顺序、真实 `trigger_macro` IPC 的成功/安全拒绝分支；无安全终端时拒绝发送属于预期行为。
- macOS 会检查前台应用及光标下窗口是否为安全终端。
- Windows 现在通过 `GetForegroundWindow -> GetWindowThreadProcessId -> QueryFullProcessImageNameW` 读取前台进程，并按终端进程白名单放行；未知进程或 API 失败会拒绝宏。Windows 真实 runner 仍需验证权限、UWP 窗口和不同终端宿主的实际进程名。
- Linux 的 `active_app_is_safe()` 仍为兼容性回退 `true`，Wayland/X11 前台窗口识别另列为跨平台 P1，不应与 Windows 安全结论混淆。

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

当前默认仍是“纯托盘”；用户选择“保持 Dock/任务栏入口”后，macOS 关闭窗口回到隐藏但保留 Regular/Dock，Windows/Linux 关闭请求改为最小化并可从任务栏恢复。

## 优化建议

### P0：发布前必须处理

1. Windows 前台应用安全识别真实验证：源码已加入前台进程白名单，但 Windows runner 仍需覆盖 PowerShell、Windows Terminal、UWP、管理员权限和进程查询失败场景。
2. 输入权限闭环：macOS 提供 Accessibility 入口；Windows 不伪造授权页，打开隐私诊断并给出权限级别/UIPI/安全软件操作说明。
3. 补齐真实平台 E2E：当前 macOS WebKit E2E 已通过；新增 Windows CI 会在可用桌面二进制时执行托盘、任务栏恢复、`Ctrl/Cmd+Shift+数字` 注册和宏安全门禁。

### P1：跨平台与高频可用性

1. 在 Windows 原生 runner 上覆盖 PowerShell、Windows Terminal、UWP 窗口、管理员权限和 UIPI 场景；在 Linux 补充 Wayland/X11 前台窗口识别。
2. 将 E2E 固化为 `pnpm test:e2e` 后持续纳入发布流水线，并清理 tauri-service 的 `Window 'main' not found`、mock-store warning。
3. 在快捷键冲突 API 可用时补充占用进程名称；当前协议明确标注只能确认“其他应用”，不伪造所有者信息。
4. 将窗口入口策略、冲突回滚和宏失败恢复纳入 Windows 真实桌面 E2E，而不只依赖前端后门。

### P2：体验与维护

1. Three.js 核心运行时仍约 589 kB（gzip 约 150 kB）；特效族已拆分，后续可继续按按需加载和渲染器能力拆分核心运行时。
2. 清理现有组件测试中的 React `act(...)` 警告，避免真实回归被测试噪声掩盖。
3. 将平台能力矩阵写入发布流水线，区分“源码 cfg 编译通过”和“真实桌面行为通过”。

## 结论

当前 macOS/host 代码路径已完成窗口入口、快捷键扩展、冲突回滚和宏恢复闭环；Three.js 产物按特效族拆分，CI 已增加 Windows 原生 target/能力诊断/E2E job。Windows 真实桌面行为仍以 CI runner 结果为准，当前主机不能宣称已完成物理验证。
